import { Router } from 'express';
import { randomUUID as uuidv4 } from 'crypto';
import db, { getOrCreateUser, rowToObject } from '../db.js';
import { verifyAuth } from '../middleware/auth.js';
import logger from '../logger.js';

const router = Router();

router.post('/api/folders', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { name, parentFolderId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const folderId = uuidv4();
    db.prepare(`
      INSERT INTO folders (id, user_id, name, parent_folder_id)
      VALUES (?, ?, ?, ?)
    `).run(folderId, user.id, name, parentFolderId || null);

    const folder = rowToObject(db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId));
    res.json(folder);
  } catch (error) {
    logger.error({ err: error }, 'Create folder error');
    res.status(500).json({ error: 'Failed to create folder', message: error.message });
  }
});

router.get('/api/folders', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const parentFolderId = req.query.parentFolderId || null;

    const query = parentFolderId
      ? 'SELECT * FROM folders WHERE user_id = ? AND parent_folder_id = ? AND is_deleted = 0 ORDER BY name ASC'
      : 'SELECT * FROM folders WHERE user_id = ? AND parent_folder_id IS NULL AND is_deleted = 0 ORDER BY name ASC';

    const folders = parentFolderId
      ? db.prepare(query).all(user.id, parentFolderId).map(rowToObject)
      : db.prepare(query).all(user.id).map(rowToObject);
    res.json(folders);
  } catch (error) {
    logger.error({ err: error }, 'List folders error');
    res.status(500).json({ error: 'Failed to list folders', message: error.message });
  }
});

router.put('/api/folders/:id', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { id } = req.params;

    const folder = rowToObject(db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(id, user.id));
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const updates = [];
    const values = [];
    if (req.body.name !== undefined) {
      updates.push('name = ?');
      values.push(req.body.name);
    }
    if (req.body.isStarred !== undefined) {
      updates.push('is_starred = ?');
      values.push(req.body.isStarred ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id, user.id);
      db.prepare(`UPDATE folders SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    }

    const updated = rowToObject(db.prepare('SELECT * FROM folders WHERE id = ?').get(id));
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Update folder error');
    res.status(500).json({ error: 'Failed to update folder', message: error.message });
  }
});

router.delete('/api/folders/:id', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { id } = req.params;

    db.prepare(`
      UPDATE folders SET is_deleted = 1, deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(id, user.id);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Delete folder error');
    res.status(500).json({ error: 'Failed to delete folder', message: error.message });
  }
});

export default router;
