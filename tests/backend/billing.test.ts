import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers';

// Mocks for everything the billing router imports. The test-billing security
// guard returns before any of these are exercised, so simple stubs suffice.
const prepare = vi.fn();
const getOrCreateUser = vi.fn(() => ({ id: 'user-1', email: 'a@b.c' }));
const rowToObject = vi.fn((row: any) => row ?? null);

vi.mock('../../backend/db.js', () => ({
  default: { prepare },
  getOrCreateUser,
  rowToObject,
}));

vi.mock('../../backend/middleware/auth.js', () => ({
  verifyAuth: (req: any, res: any, next: any) => {
    if (req.headers.authorization === 'Bearer good') {
      req.user = { uid: 'caller-uid', email: 'a@b.c', name: 'Tester' };
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  },
  firestore: null,
}));

vi.mock('../../backend/paymentService.js', () => ({ createPaymentOrder: vi.fn() }));
vi.mock('../../backend/billingUtils.js', () => ({}));
vi.mock('../../backend/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { default: billingRouter } = await import('../../backend/routes/billing.js');
const app = makeApp(billingRouter);

const origNodeEnv = process.env.NODE_ENV;
const origCashfree = process.env.CASHFREE_ENVIRONMENT;
afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  process.env.CASHFREE_ENVIRONMENT = origCashfree;
  getOrCreateUser.mockClear();
});

describe('POST /api/billing/test-billing — security guard', () => {
  it('requires authentication (401)', async () => {
    const res = await request(app).post('/api/billing/test-billing').send({});
    expect(res.status).toBe(401);
  });

  it('is fail-closed in production: blocked when NODE_ENV=production alone', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CASHFREE_ENVIRONMENT = 'SANDBOX';
    const res = await request(app)
      .post('/api/billing/test-billing')
      .set('Authorization', 'Bearer good')
      .send({});
    expect(res.status).toBe(403);
  });

  it('is fail-closed in production: blocked when CASHFREE_ENVIRONMENT=PRODUCTION alone', async () => {
    process.env.NODE_ENV = 'development';
    process.env.CASHFREE_ENVIRONMENT = 'PRODUCTION';
    const res = await request(app)
      .post('/api/billing/test-billing')
      .set('Authorization', 'Bearer good')
      .send({});
    expect(res.status).toBe(403);
  });

  it('operates on the AUTHENTICATED caller, never a body-supplied userId', async () => {
    process.env.NODE_ENV = 'development';
    process.env.CASHFREE_ENVIRONMENT = 'SANDBOX';
    // Past the guard it resolves the caller via getOrCreateUser, then runs SQL we
    // do not fully stub — so the handler may error afterwards. We only assert it
    // never honoured the attacker-supplied userId.
    prepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined), run: vi.fn() });
    await request(app)
      .post('/api/billing/test-billing')
      .set('Authorization', 'Bearer good')
      .send({ userId: 'victim-account' });
    expect(getOrCreateUser).toHaveBeenCalledWith('caller-uid', 'a@b.c', 'Tester');
  });
});
