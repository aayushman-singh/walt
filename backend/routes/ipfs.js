import { Router } from 'express';
import { readFile } from 'fs/promises';
import { randomUUID as uuidv4 } from 'crypto';
import ipfs, { upload } from '../ipfs.js';
import db, { getOrCreateUser, rowToObject } from '../db.js';
import { verifyAuth, firestore } from '../middleware/auth.js';
import logger from '../logger.js';

const router = Router();

router.get('/api/ipfs/status', verifyAuth, async (req, res) => {
  try {
    const id = await ipfs.id();
    const peers = await ipfs.swarm.peers();
    const stats = await ipfs.repo.stat();

    res.json({
      healthy: true,
      peerCount: peers.length,
      repoSize: Number(stats.repoSize),
      storageMax: Number(stats.storageMax),
      nodeId: id.id.toString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'IPFS status check failed');
    res.status(500).json({ error: 'IPFS not available', message: error.message });
  }
});

// No auth required - used for homepage demo uploads
router.post('/api/ipfs/upload/guest', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const MAX_GUEST_SIZE = 200 * 1024 * 1024; // 200 MB
    if (req.file.size > MAX_GUEST_SIZE) {
      return res.status(413).json({
        error: 'File too large for guest upload',
        maxSize: MAX_GUEST_SIZE,
      });
    }

    // Not pinned to conserve resources
    const fileBuffer = await readFile(req.file.path);
    const result = await ipfs.add(fileBuffer, { pin: false });
    const cid = result.cid.toString();
    const size = Number(result.size);

    logger.info({ filename: req.file.originalname, size, cid }, 'Guest upload');

    res.json({
      cid,
      size,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    });
  } catch (error) {
    logger.error({ err: error }, 'Guest upload error');
    res.status(500).json({ error: 'Upload failed', message: error.message });
  }
});

router.post('/api/ipfs/upload', verifyAuth, upload.single('file'), async (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const storageStats = db.prepare('SELECT storage_used, storage_limit FROM users WHERE id = ?').get(user.id);
    if (storageStats.storage_used + req.file.size > storageStats.storage_limit) {
      return res.status(413).json({
        error: 'Storage quota exceeded',
        used: storageStats.storage_used,
        limit: storageStats.storage_limit,
      });
    }

    // Check user preference from Firestore, fallback to auto-pin
    let storedAutoPinPreference = true;
    if (firestore) {
      try {
        const userDoc = await firestore.collection('users').doc(req.user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        if (userData && typeof userData.autoPinEnabled === 'boolean') {
          storedAutoPinPreference = userData.autoPinEnabled;
        }
      } catch (prefError) {
        logger.warn({ err: prefError, uid: req.user.uid }, 'Failed to load auto-pin preference from Firestore');
      }
    }

    // Request body overrides stored preference
    let shouldPinOnUpload;
    if (typeof req.body.isPinned !== 'undefined' || typeof req.body.autoPin !== 'undefined') {
      shouldPinOnUpload = req.body.isPinned === 'true' || req.body.autoPin === 'true';
    } else {
      shouldPinOnUpload = storedAutoPinPreference;
    }

    const fileBuffer = await readFile(req.file.path);
    const result = await ipfs.add(fileBuffer, { pin: shouldPinOnUpload });
    const cid = result.cid.toString();
    const size = Number(result.size);

    const fileId = uuidv4();
    const folderId = req.body.folderId || null;
    const isPinned = shouldPinOnUpload;

    db.prepare(`
      INSERT INTO files (
        id, user_id, cid, filename, original_filename, size, mime_type,
        parent_folder_id, is_pinned, pin_service, pin_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fileId, user.id, cid, req.file.originalname, req.file.originalname,
      size, req.file.mimetype, folderId, isPinned ? 1 : 0,
      isPinned ? 'local' : null, isPinned ? 'pinned' : 'unpinned'
    );

    db.prepare("UPDATE users SET storage_used = storage_used + ?, updated_at = datetime('now') WHERE id = ?")
      .run(size, user.id);

    db.prepare(`
      INSERT INTO activity_logs (id, user_id, file_id, action, ip_address, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), user.id, fileId, 'upload',
      req.ip, req.get('user-agent'),
      JSON.stringify({ cid, filename: req.file.originalname, size })
    );

    res.json({
      success: true,
      file: {
        id: fileId,
        cid,
        filename: req.file.originalname,
        size,
        mimeType: req.file.mimetype,
        isPinned,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Upload error');
    res.status(500).json({ error: 'Upload failed', message: error.message });
  }
});

router.get('/api/ipfs/list', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const folderId = req.query.folderId || null;

    const filesQuery = folderId
      ? 'SELECT * FROM files WHERE user_id = ? AND parent_folder_id = ? AND is_deleted = 0 ORDER BY created_at DESC'
      : 'SELECT * FROM files WHERE user_id = ? AND parent_folder_id IS NULL AND is_deleted = 0 ORDER BY created_at DESC';

    const files = folderId
      ? db.prepare(filesQuery).all(user.id, folderId).map(rowToObject)
      : db.prepare(filesQuery).all(user.id).map(rowToObject);

    const foldersQuery = folderId
      ? 'SELECT * FROM folders WHERE user_id = ? AND parent_folder_id = ? AND is_deleted = 0 ORDER BY name ASC'
      : 'SELECT * FROM folders WHERE user_id = ? AND parent_folder_id IS NULL AND is_deleted = 0 ORDER BY name ASC';

    const folders = folderId
      ? db.prepare(foldersQuery).all(user.id, folderId).map(rowToObject)
      : db.prepare(foldersQuery).all(user.id).map(rowToObject);

    res.json({ files, folders });
  } catch (error) {
    logger.error({ err: error }, 'List error');
    res.status(500).json({ error: 'Failed to list files', message: error.message });
  }
});

router.get('/api/ipfs/download', verifyAuth, async (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { cid, fileId } = req.query;

    let fileRecord;
    if (fileId) {
      fileRecord = rowToObject(db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0').get(fileId, user.id));
      if (!fileRecord) {
        return res.status(404).json({ error: 'File not found' });
      }
    } else if (cid) {
      fileRecord = rowToObject(db.prepare('SELECT * FROM files WHERE cid = ? AND user_id = ? AND is_deleted = 0').get(cid, user.id));
      if (!fileRecord) {
        return res.status(404).json({ error: 'File not found' });
      }
    } else {
      return res.status(400).json({ error: 'Missing cid or fileId parameter' });
    }

    // Get file from IPFS
    const chunks = [];
    for await (const chunk of ipfs.cat(fileRecord.cid)) {
      chunks.push(chunk);
    }

    // Update last accessed
    db.prepare("UPDATE files SET last_accessed_at = datetime('now') WHERE id = ?").run(fileRecord.id);

    // Log activity
    db.prepare(`
      INSERT INTO activity_logs (id, user_id, file_id, action, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), user.id, fileRecord.id, 'download', req.ip, req.get('user-agent'));

    // Send file
    const buffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', fileRecord.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.original_filename || fileRecord.filename}"`);
    res.send(buffer);
  } catch (error) {
    logger.error({ err: error }, 'Download error');
    res.status(500).json({ error: 'Download failed', message: error.message });
  }
});

router.post('/api/ipfs/add', verifyAuth, async (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { data, pin } = req.body;

    if (!data) {
      return res.status(400).json({ error: 'Missing data parameter' });
    }

    let buffer;
    if (typeof data === 'string') {
      // If it's a string, encode it as UTF-8
      buffer = Buffer.from(data, 'utf-8');
    } else {
      return res.status(400).json({ error: 'Data must be a string' });
    }

    // Upload to IPFS
    const shouldPin = pin === true || pin === 'true';
    const result = await ipfs.add(buffer, { pin: shouldPin });
    const cid = result.cid.toString();
    const size = Number(result.size);

    res.json({
      success: true,
      cid,
      size,
      ipfsUri: `ipfs://${cid}`
    });
  } catch (error) {
    logger.error({ err: error }, 'IPFS add error');
    res.status(500).json({ error: 'Failed to add data to IPFS', message: error.message });
  }
});

router.post('/api/ipfs/pin', verifyAuth, async (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { cid } = req.body;

    if (!cid) {
      return res.status(400).json({ error: 'Missing CID parameter' });
    }

    const file = rowToObject(
      db.prepare('SELECT * FROM files WHERE cid = ? AND user_id = ? AND is_deleted = 0').get(cid, user.id)
    );
    if (!file) {
      return res.status(404).json({ error: 'File not found for this user' });
    }

    if (file.is_pinned) {
      return res.json({
        success: true,
        cid,
        message: 'File already pinned'
      });
    }

    const pinnedRecords = db
      .prepare('SELECT COUNT(*) AS count FROM files WHERE cid = ? AND is_pinned = 1 AND is_deleted = 0')
      .get(cid);

    if (!pinnedRecords || pinnedRecords.count === 0) {
      await ipfs.pin.add(cid);
    }

    db.prepare(`
      UPDATE files SET is_pinned = 1, pin_service = 'local', pin_status = 'pinned', updated_at = datetime('now')
      WHERE cid = ? AND user_id = ?
    `).run(cid, user.id);

    res.json({
      success: true,
      cid,
      message: 'File pinned successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Pin error');
    res.status(500).json({ error: 'Failed to pin file', message: error.message });
  }
});

router.delete('/api/ipfs/pin/:cid', verifyAuth, async (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { cid } = req.params;

    if (!cid) {
      return res.status(400).json({ error: 'Missing CID parameter' });
    }

    const file = rowToObject(
      db.prepare('SELECT * FROM files WHERE cid = ? AND user_id = ? AND is_deleted = 0').get(cid, user.id)
    );
    if (!file) {
      return res.status(404).json({ error: 'File not found for this user' });
    }

    if (!file.is_pinned) {
      return res.json({
        success: true,
        cid,
        message: 'File already unpinned'
      });
    }

    const pinnedReferences = db
      .prepare('SELECT COUNT(*) as count FROM files WHERE cid = ? AND is_pinned = 1 AND is_deleted = 0')
      .get(cid);

    if (!pinnedReferences) {
      return res.status(500).json({ error: 'Unable to verify pin references' });
    }

    if (pinnedReferences.count <= 1) {
      // Safe to unpin from node (no other pinned references)
      await ipfs.pin.rm(cid);
    }

    db.prepare(`
      UPDATE files SET is_pinned = 0, pin_service = NULL, pin_status = 'unpinned', updated_at = datetime('now')
      WHERE cid = ? AND user_id = ?
    `).run(cid, user.id);

    res.json({
      success: true,
      cid,
      message: 'File unpinned successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Unpin error');
    // If the pin doesn't exist, that's okay - consider it a success
    if (error.message && error.message.includes('not pinned')) {
      res.json({
        success: true,
        cid,
        message: 'File unpinned successfully'
      });
    } else {
      res.status(500).json({ error: 'Failed to unpin file', message: error.message });
    }
  }
});

export default router;
