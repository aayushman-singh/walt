import Database from 'better-sqlite3';
import { randomUUID as uuidv4 } from 'crypto';

const dbPath = process.env.DATABASE_URL?.replace('sqlite://', '') || './data/ipfs-drive.db';
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL'); // Better concurrency for writes

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firebase_uid TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      storage_used INTEGER DEFAULT 0,
      storage_limit INTEGER DEFAULT 10737418240,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      is_starred INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
    CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_folder_id);

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cid TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT,
      size INTEGER,
      mime_type TEXT,
      parent_folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      is_pinned INTEGER DEFAULT 0,
      pin_service TEXT,
      pin_status TEXT,
      is_starred INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      deleted_at TEXT,
      last_accessed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
    CREATE INDEX IF NOT EXISTS idx_files_cid ON files(cid);
    CREATE INDEX IF NOT EXISTS idx_files_parent_folder ON files(parent_folder_id);

    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      share_token TEXT UNIQUE NOT NULL,
      permission_level TEXT DEFAULT 'viewer',
      password_hash TEXT,
      expires_at TEXT,
      max_downloads INTEGER,
      download_count INTEGER DEFAULT 0,
      access_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      last_accessed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(share_token);

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_file_id ON activity_logs(file_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

    CREATE TABLE IF NOT EXISTS billing_info (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_method_added INTEGER DEFAULT 0,
      payment_info_received_at TEXT,
      services_blocked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_billing_info_user_id ON billing_info(user_id);

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cashfree_order_id TEXT UNIQUE,
      order_amount REAL NOT NULL,
      order_currency TEXT DEFAULT 'INR',
      order_status TEXT DEFAULT 'PENDING',
      payment_session_id TEXT,
      payment_link TEXT,
      billing_period_start TEXT,
      billing_period_end TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_cashfree_order_id ON orders(cashfree_order_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      billing_day INTEGER NOT NULL,
      last_billed_at TEXT,
      next_billing_at TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

    CREATE TABLE IF NOT EXISTS short_links (
      id TEXT PRIMARY KEY,
      short_code TEXT UNIQUE NOT NULL,
      file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      share_id TEXT REFERENCES shares(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      access_count INTEGER DEFAULT 0,
      last_accessed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_short_links_code ON short_links(short_code);
    CREATE INDEX IF NOT EXISTS idx_short_links_file_id ON short_links(file_id);
    CREATE INDEX IF NOT EXISTS idx_short_links_user_id ON short_links(user_id);
  `);
}

// Short code generation utility
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateShortCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += BASE62[Math.floor(Math.random() * BASE62.length)];
  }
  return code;
}

export function getUniqueShortCode(db, maxAttempts = 10) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const code = generateShortCode();
    const existing = db.prepare('SELECT id FROM short_links WHERE short_code = ?').get(code);

    if (!existing) {
      return code;
    }

    attempts++;
  }

  throw new Error('Failed to generate unique short code after multiple attempts');
}

initializeSchema();

export function getOrCreateUser(firebaseUid, email, displayName) {
  let user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(firebaseUid);

  if (!user) {
    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, firebase_uid, email, display_name)
      VALUES (?, ?, ?, ?)
    `).run(userId, firebaseUid, email, displayName || null);
    user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(firebaseUid);
  } else if (user.email !== email || user.display_name !== displayName) {
    db.prepare(`
      UPDATE users SET email = ?, display_name = ?, updated_at = datetime('now')
      WHERE firebase_uid = ?
    `).run(email, displayName || null, firebaseUid);
    user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(firebaseUid);
  }

  return user;
}

export function rowToObject(row) {
  if (!row) return null;
  const obj = { ...row };
  // SQLite stores booleans as integers
  Object.keys(obj).forEach(key => {
    if ((key.includes('is_') || key === 'is_active' || key === 'is_deleted' || key === 'is_starred' || key === 'is_pinned') && typeof obj[key] === 'number') {
      obj[key] = obj[key] === 1;
    }
    if (key === 'metadata' && typeof obj[key] === 'string') {
      try {
        obj[key] = JSON.parse(obj[key]);
      } catch {}
    }
  });
  return obj;
}

export default db;
