import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers';

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

const { default: foldersRouter } = await import('../../backend/routes/folders.js');
const app = makeApp(foldersRouter);

beforeEach(() => {
  prepare.mockReset();
  rowToObject.mockImplementation((row: any) => row ?? null);
});

describe('POST /api/folders', () => {
  it('returns 400 when name is missing (validation error)', async () => {
    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', 'Bearer good')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Folder name is required' });
  });

  it('creates a folder and returns the row', async () => {
    const run = vi.fn();
    const createdRow = { id: 'fld-x', name: 'Photos', parent_folder_id: null };
    prepare
      .mockReturnValueOnce({ run }) // INSERT
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue(createdRow) }); // SELECT

    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', 'Bearer good')
      .send({ name: 'Photos' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Photos' });
    expect(run).toHaveBeenCalled();
  });
});

describe('GET /api/folders', () => {
  it('lists root folders for the user', async () => {
    const rows = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ];
    prepare.mockReturnValue({ all: vi.fn().mockReturnValue(rows) });

    const res = await request(app).get('/api/folders').set('Authorization', 'Bearer good');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ name: 'Alpha' });
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/folders');
    expect(res.status).toBe(401);
  });
});
