import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Works from both project root and backend directory
dotenv.config({ path: join(__dirname, '.env') });

// Handle empty string env vars from shell - prioritize .env file values
const firebaseVarsEmpty =
  process.env.FIREBASE_PROJECT_ID === '' ||
  process.env.FIREBASE_CLIENT_EMAIL === '' ||
  process.env.FIREBASE_PRIVATE_KEY === '';

if (firebaseVarsEmpty) {
  dotenv.config({ path: join(__dirname, '.env'), override: true });
}

const { default: logger } = await import('./logger.js');

// Side-effectful modules (db schema init, firebase init, ipfs client) are imported
// after dotenv so they read the loaded environment.
await import('./db.js');
await import('./middleware/auth.js');
await import('./ipfs.js');

const { default: ipfsRouter } = await import('./routes/ipfs.js');
const { default: foldersRouter } = await import('./routes/folders.js');
const { default: filesRouter } = await import('./routes/files.js');
const { default: userRouter } = await import('./routes/user.js');
const { default: sharesRouter } = await import('./routes/shares.js');
const { default: billingRouter } = await import('./routes/billing.js');
const { default: paymentsRouter } = await import('./routes/payments.js');

const app = express();

// CORS is handled by nginx in production
// Raw body needed for webhook signature verification
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

const jsonParser = express.json();
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payment/webhook') {
    return next();
  }
  return jsonParser(req, res, next);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(ipfsRouter);
app.use(foldersRouter);
app.use(filesRouter);
app.use(userRouter);
app.use(sharesRouter);
app.use(billingRouter);
app.use(paymentsRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'Server started');
});
