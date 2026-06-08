import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import multer from 'multer';
import { makeApp } from './helpers';

const prepare = vi.fn();
const getOrCreateUser = vi.fn(() => ({ id: 'user-1', firebase_uid: 'test-user' }));
const rowToObject = vi.fn((row: any) => row ?? null);

// IPFS client stub
const ipfsAdd = vi.fn();
const ipfsId = vi.fn();
const swarmPeers = vi.fn();
const repoStat = vi.fn();

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

// Real multer with memory storage so multipart parsing actually works,
// plus the stubbed ipfs client.
vi.mock('../../backend/ipfs.js', () => ({
  default: {
    add: ipfsAdd,
    id: ipfsId,
    swarm: { peers: swarmPeers },
    repo: { stat: repoStat },
  },
  upload: multer({ storage: multer.memoryStorage() }),
}));

// Route calls readFile(req.file.path); with memory storage there is no path,
// so return a deterministic buffer instead of touching the filesystem.
vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('file-bytes')),
}));

const { default: ipfsRouter } = await import('../../backend/routes/ipfs.js');
const app = makeApp(ipfsRouter);

beforeEach(() => {
  prepare.mockReset();
  rowToObject.mockImplementation((row: any) => row ?? null);
  ipfsAdd.mockReset();
  ipfsId.mockReset();
  swarmPeers.mockReset();
  repoStat.mockReset();
});

describe('GET /api/ipfs/status', () => {
  it('requires auth (401)', async () => {
    const res = await request(app).get('/api/ipfs/status');
    expect(res.status).toBe(401);
  });

  it('reports node health', async () => {
    ipfsId.mockResolvedValue({ id: { toString: () => 'node-abc' } });
    swarmPeers.mockResolvedValue([{}, {}, {}]);
    repoStat.mockResolvedValue({ repoSize: 1000n, storageMax: 5000n });

    const res = await request(app).get('/api/ipfs/status').set('Authorization', 'Bearer good');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      healthy: true,
      peerCount: 3,
      repoSize: 1000,
      storageMax: 5000,
      nodeId: 'node-abc',
    });
  });

  it('returns 500 when the node is unreachable', async () => {
    ipfsId.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/api/ipfs/status').set('Authorization', 'Bearer good');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('IPFS not available');
  });
});

describe('POST /api/ipfs/upload', () => {
  it('returns 400 when no file is attached (validation error)', async () => {
    const res = await request(app).post('/api/ipfs/upload').set('Authorization', 'Bearer good');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'No file provided' });
  });

  it('returns 413 when storage quota would be exceeded', async () => {
    prepare.mockReturnValue({
      get: vi.fn().mockReturnValue({ storage_used: 999, storage_limit: 1000 }),
    });

    const res = await request(app)
      .post('/api/ipfs/upload')
      .set('Authorization', 'Bearer good')
      .attach('file', Buffer.from('hello world this is bigger than 1 byte'), 'big.txt');

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Storage quota exceeded');
  });

  it('stores the file and returns the created record on success', async () => {
    // 1st prepare().get -> storage stats ; subsequent prepare().run -> writes
    prepare
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ storage_used: 0, storage_limit: 1_000_000 }) })
      .mockReturnValue({ run: vi.fn() });
    ipfsAdd.mockResolvedValue({ cid: { toString: () => 'QmCID123' }, size: 11 });

    const res = await request(app)
      .post('/api/ipfs/upload')
      .set('Authorization', 'Bearer good')
      .attach('file', Buffer.from('hello world'), 'note.txt');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.file).toMatchObject({
      cid: 'QmCID123',
      filename: 'note.txt',
      size: 11,
    });
    expect(ipfsAdd).toHaveBeenCalled();
  });
});

describe('POST /api/ipfs/add', () => {
  it('returns 400 when data is missing', async () => {
    const res = await request(app)
      .post('/api/ipfs/add')
      .set('Authorization', 'Bearer good')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing data parameter' });
  });

  it('adds string data and returns an ipfs uri', async () => {
    ipfsAdd.mockResolvedValue({ cid: { toString: () => 'QmStr' }, size: 5 });

    const res = await request(app)
      .post('/api/ipfs/add')
      .set('Authorization', 'Bearer good')
      .send({ data: 'hello' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, cid: 'QmStr', ipfsUri: 'ipfs://QmStr' });
  });
});
