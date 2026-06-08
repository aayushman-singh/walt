import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers';

const prepare = vi.fn();
const getOrCreateUser = vi.fn(() => ({ id: 'user-1', firebase_uid: 'test-user' }));
const rowToObject = vi.fn((row: any) => row ?? null);
const getUniqueShortCode = vi.fn(() => 'sh0rt1');

vi.mock('../../backend/db.js', () => ({
  default: { prepare },
  getOrCreateUser,
  rowToObject,
  getUniqueShortCode,
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

const { default: sharesRouter } = await import('../../backend/routes/shares.js');
const app = makeApp(sharesRouter);

beforeEach(() => {
  prepare.mockReset();
  rowToObject.mockImplementation((row: any) => row ?? null);
  getUniqueShortCode.mockReturnValue('sh0rt1');
});

describe('POST /api/shares', () => {
  it('requires auth (401)', async () => {
    const res = await request(app).post('/api/shares').send({ fileId: 'f1' });
    expect(res.status).toBe(401);
  });

  it('creates a share and returns token + short url', async () => {
    const run = vi.fn();
    prepare.mockReturnValue({ run });

    const res = await request(app)
      .post('/api/shares')
      .set('Authorization', 'Bearer good')
      .send({ fileId: 'f1', permissionLevel: 'viewer' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('shareId');
    expect(res.body).toHaveProperty('shareToken');
    expect(typeof res.body.shareToken).toBe('string');
    expect(res.body.shareUrl).toContain('/share/');
    expect(res.body.shortCode).toBe('sh0rt1');
    expect(res.body.shortUrl).toContain('/s/sh0rt1');
  });
});

describe('GET /api/shares/:token', () => {
  it('returns 404 for an unknown token', async () => {
    prepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) });

    const res = await request(app).get('/api/shares/doesnotexist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Share not found' });
  });

  it('returns 410 for an expired share', async () => {
    const expired = {
      id: 's1',
      share_token: 'tok',
      is_active: 1,
      expires_at: '2000-01-01T00:00:00.000Z',
      file_id: 'f1',
    };
    prepare.mockReturnValue({ get: vi.fn().mockReturnValue(expired) });

    const res = await request(app).get('/api/shares/tok');

    expect(res.status).toBe(410);
    expect(res.body).toEqual({ error: 'Share has expired' });
  });

  it('resolves a valid file share', async () => {
    const share = { id: 's1', share_token: 'tok', is_active: 1, file_id: 'f1' };
    const file = { id: 'f1', filename: 'pic.png' };
    prepare
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue(share) }) // load share
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue(file) }); // load file

    const res = await request(app).get('/api/shares/tok');

    expect(res.status).toBe(200);
    expect(res.body.share).toMatchObject({ id: 's1' });
    expect(res.body.file).toMatchObject({ filename: 'pic.png' });
  });
});
