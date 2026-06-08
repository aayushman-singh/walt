import { Router } from 'express';
import db, { getOrCreateUser, rowToObject } from '../db.js';
import { verifyAuth } from '../middleware/auth.js';
import logger from '../logger.js';

const router = Router();

router.get('/api/user/profile', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      storageUsed: user.storage_used,
      storageLimit: user.storage_limit,
    });
  } catch (error) {
    logger.error({ err: error }, 'Get profile error');
    res.status(500).json({ error: 'Failed to get profile', message: error.message });
  }
});

router.get('/api/user/storage', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    res.json({
      used: user.storage_used,
      limit: user.storage_limit,
      percentage: (user.storage_used / user.storage_limit) * 100,
    });
  } catch (error) {
    logger.error({ err: error }, 'Get storage error');
    res.status(500).json({ error: 'Failed to get storage stats', message: error.message });
  }
});

router.get('/api/activity', verifyAuth, (req, res) => {
  try {
    const user = getOrCreateUser(req.user.uid, req.user.email, req.user.name);
    const limit = parseInt(req.query.limit) || 20;

    const logs = db.prepare(`
      SELECT * FROM activity_logs WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(user.id, limit).map(rowToObject);

    res.json(logs);
  } catch (error) {
    logger.error({ err: error }, 'Get activity error');
    res.status(500).json({ error: 'Failed to get activity', message: error.message });
  }
});

export default router;
