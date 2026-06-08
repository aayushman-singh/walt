import { Router } from 'express';
import db, { getOrCreateUser, rowToObject } from '../db.js';
import { verifyAuth } from '../middleware/auth.js';
import logger from '../logger.js';

const router = Router();

router.get('/api/files/:id', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { id } = req.params;

    const file = rowToObject(db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0').get(id, user.id));
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(file);
  } catch (error) {
    logger.error({ err: error }, 'Get file error');
    res.status(500).json({ error: 'Failed to get file', message: error.message });
  }
});

router.put('/api/files/:id', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { id } = req.params;

    const file = rowToObject(db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(id, user.id));
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const updates = [];
    const values = [];
    if (req.body.filename !== undefined) {
      updates.push('filename = ?');
      values.push(req.body.filename);
    }
    if (req.body.isStarred !== undefined) {
      updates.push('is_starred = ?');
      values.push(req.body.isStarred ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id, user.id);
      db.prepare(`UPDATE files SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    }

    const updated = rowToObject(db.prepare('SELECT * FROM files WHERE id = ?').get(id));
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Update file error');
    res.status(500).json({ error: 'Failed to update file', message: error.message });
  }
});

router.delete('/api/files/:id', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const { id } = req.params;

    db.prepare(`
      UPDATE files SET is_deleted = 1, deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(id, user.id);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Delete file error');
    res.status(500).json({ error: 'Failed to delete file', message: error.message });
  }
});

export default router;
