import { Router } from 'express';
import { randomUUID as uuidv4 } from 'crypto';
import db, { getOrCreateUser, rowToObject, getUniqueShortCode } from '../db.js';
import { verifyAuth } from '../middleware/auth.js';
import logger from '../logger.js';

const router = Router();

router.post('/api/shares', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { fileId, folderId, permissionLevel, password, expiresAt, maxDownloads } = req.body;

    const shareId = uuidv4();
    const shareToken = uuidv4().replace(/-/g, '');

    db.prepare(`
      INSERT INTO shares (id, file_id, folder_id, user_id, share_token, permission_level, password_hash, expires_at, max_downloads)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      shareId, fileId || null, folderId || null, user.id, shareToken,
      permissionLevel || 'viewer', password || null, expiresAt || null, maxDownloads || null
    );

    // Generate short link automatically
    let shortCode = null;
    let shortUrl = null;
    try {
      const shortLinkId = uuidv4();
      shortCode = getUniqueShortCode(db);

      db.prepare(`
        INSERT INTO short_links (id, short_code, file_id, folder_id, user_id, share_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        shortLinkId, shortCode, fileId || null, folderId || null, user.id, shareId
      );

      shortUrl = `${process.env.FRONTEND_URL || 'https://walt.aayushman.dev'}/s/${shortCode}`;
    } catch (shortLinkError) {
      logger.warn({ err: shortLinkError, shareId }, 'Failed to create short link');
      // Continue without short link - not critical
    }

    res.json({
      shareId,
      shareToken,
      shareUrl: `${process.env.FRONTEND_URL || 'https://walt.aayushman.dev'}/share/${shareToken}`,
      shortCode,
      shortUrl,
    });
  } catch (error) {
    logger.error({ err: error }, 'Create share error');
    res.status(500).json({ error: 'Failed to create share', message: error.message });
  }
});

router.get('/api/shares/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const share = rowToObject(db.prepare('SELECT * FROM shares WHERE share_token = ? AND is_active = 1').get(token));

    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }

    // Check max downloads
    if (share.max_downloads && share.download_count >= share.max_downloads) {
      return res.status(410).json({ error: 'Share download limit reached' });
    }

    // Get file or folder
    if (share.file_id) {
      const file = rowToObject(db.prepare('SELECT * FROM files WHERE id = ?').get(share.file_id));
      res.json({ share, file });
    } else if (share.folder_id) {
      const folder = rowToObject(db.prepare('SELECT * FROM folders WHERE id = ?').get(share.folder_id));
      res.json({ share, folder });
    } else {
      res.status(404).json({ error: 'Share target not found' });
    }
  } catch (error) {
    logger.error({ err: error }, 'Get share error');
    res.status(500).json({ error: 'Failed to get share', message: error.message });
  }
});

router.get('/api/s/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const shortLink = rowToObject(db.prepare('SELECT * FROM short_links WHERE short_code = ?').get(code));

    if (!shortLink) {
      return res.status(404).json({ error: 'Short link not found' });
    }

    db.prepare(`
      UPDATE short_links
      SET access_count = access_count + 1,
          last_accessed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(shortLink.id);

    // Get the associated share
    let share = null;
    if (shortLink.share_id) {
      share = rowToObject(db.prepare('SELECT * FROM shares WHERE id = ? AND is_active = 1').get(shortLink.share_id));
    } else if (shortLink.file_id) {
      // If no share exists, find or create one
      share = rowToObject(db.prepare('SELECT * FROM shares WHERE file_id = ? AND is_active = 1 LIMIT 1').get(shortLink.file_id));
    }

    if (share) {
      // Redirect to share page
      const shareUrl = `${process.env.FRONTEND_URL || 'https://walt.aayushman.dev'}/share/${share.share_token}`;
      return res.redirect(shareUrl);
    }

    // If no share, try direct file access
    if (shortLink.file_id) {
      const file = rowToObject(db.prepare('SELECT * FROM files WHERE id = ? AND is_deleted = 0').get(shortLink.file_id));
      if (file) {
        // Redirect to download or file view
        const downloadUrl = `${process.env.FRONTEND_URL || 'https://walt.aayushman.dev'}/api/ipfs/download?fileId=${file.id}`;
        return res.redirect(downloadUrl);
      }
    }

    return res.status(404).json({ error: 'File or share not found' });
  } catch (error) {
    logger.error({ err: error }, 'Short link redirect error');
    res.status(500).json({ error: 'Failed to process short link', message: error.message });
  }
});

router.get('/api/short-links/:code/info', async (req, res) => {
  try {
    const { code } = req.params;
    const shortLink = rowToObject(db.prepare('SELECT * FROM short_links WHERE short_code = ?').get(code));

    if (!shortLink) {
      return res.status(404).json({ error: 'Short link not found' });
    }

    let file = null;
    let folder = null;
    let share = null;

    if (shortLink.file_id) {
      file = rowToObject(db.prepare('SELECT * FROM files WHERE id = ?').get(shortLink.file_id));
    }
    if (shortLink.folder_id) {
      folder = rowToObject(db.prepare('SELECT * FROM folders WHERE id = ?').get(shortLink.folder_id));
    }
    if (shortLink.share_id) {
      share = rowToObject(db.prepare('SELECT * FROM shares WHERE id = ?').get(shortLink.share_id));
    }

    res.json({
      shortCode: shortLink.short_code,
      file,
      folder,
      share,
      accessCount: shortLink.access_count,
      createdAt: shortLink.created_at,
      lastAccessedAt: shortLink.last_accessed_at,
    });
  } catch (error) {
    logger.error({ err: error }, 'Get short link info error');
    res.status(500).json({ error: 'Failed to get short link info', message: error.message });
  }
});

export default router;
