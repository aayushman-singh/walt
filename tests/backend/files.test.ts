import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers';

// --- Mocks for every dependency the files router imports ---

const prepare = vi.fn();
const getOrCreateUser = vi.fn(() => ({ id: 'user-1', firebase_uid: 'test-user' }));
const rowToObject = vi.fn((row: any) => row ?? null);

vi.mock('../../backend/db.js', () => ({
  default: { prepare },
  getOrCreateUser,
  rowToObject,
}));

vi.mock('../../backend/middleware/auth.js', () => ({
  verifyAuth: (req: any, res: any, next: any) => {
    if (req.headers.authorization === 'Bearer good') {
      req.user = { uid: 'test-user', email: 'a@b.c', name: 'Tester' };
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  },
  firestore: null,
}));

vi.mock('../../backend/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { default: filesRouter } = await import('../../backend/routes/files.js');
const app = makeApp(filesRouter);

beforeEach(() => {
  prepare.mockReset();
  rowToObject.mockImplementation((row: any) => row ?? null);
});

describe('GET /api/files/:id', () => {
  it('returns 401 without a valid auth header', async () => {
    const res = await request(app).get('/api/files/abc');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns the file when found', async () => {
    const fileRow = { id: 'f1', filename: 'doc.txt', user_id: 'user-1', is_deleted: 0 };
    prepare.mockReturnValue({ get: vi.fn().mockReturnValue(fileRow) });

    const res = await request(app).get('/api/files/f1').set('Authorization', 'Bearer good');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'f1', filename: 'doc.txt' });
  });

  it('returns 404 when the file does not exist', async () => {
    prepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) });

    const res = await request(app).get('/api/files/missing').set('Authorization', 'Bearer good');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'File not found' });
  });
});

describe('DELETE /api/files/:id', () => {
  it('soft-deletes and returns success', async () => {
    const run = vi.fn();
    prepare.mockReturnValue({ run });

    const res = await request(app).delete('/api/files/f1').set('Authorization', 'Bearer good');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(run).toHaveBeenCalledWith('f1', 'user-1');
  });
});

describe('PUT /api/files/:id', () => {
  it('updates filename and returns the updated row', async () => {
    const updated = { id: 'f1', filename: 'renamed.txt' };
    const run = vi.fn();
    // 1st prepare().get -> existing file ; later prepare().get -> updated row
    prepare
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ id: 'f1', user_id: 'user-1' }) })
      .mockReturnValueOnce({ run })
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue(updated) });

    const res = await request(app)
      .put('/api/files/f1')
      .set('Authorization', 'Bearer good')
      .send({ filename: 'renamed.txt' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(run).toHaveBeenCalled();
  });
});
