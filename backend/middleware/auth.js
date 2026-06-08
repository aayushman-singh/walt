import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import logger from '../logger.js';

let firestore = null;
let firebaseAuth = null;

if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : {
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };

  const hasProjectId = !!serviceAccount.project_id;
  const hasClientEmail = !!serviceAccount.client_email;
  const hasPrivateKey = !!serviceAccount.private_key;

  if (hasProjectId && hasClientEmail && hasPrivateKey) {
    try {
      initializeApp({
        credential: cert(serviceAccount),
      });
      firestore = getFirestore();
      firebaseAuth = getAuth();
      logger.info('Firebase Admin initialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Firebase Admin initialization failed');
    }
  } else {
    logger.warn(
      {
        FIREBASE_PROJECT_ID: hasProjectId ? 'SET' : 'MISSING',
        FIREBASE_CLIENT_EMAIL: hasClientEmail ? 'SET' : 'MISSING',
        FIREBASE_PRIVATE_KEY: hasPrivateKey ? 'SET' : 'MISSING',
      },
      'Firebase Admin not initialized: missing required credentials. Authentication will not work without Firebase credentials'
    );
  }
} else {
  firestore = getFirestore();
  firebaseAuth = getAuth();
}

export async function verifyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];

    if (!firebaseAuth) {
      return res.status(503).json({
        error: 'Authentication service unavailable',
        message: 'Firebase Admin is not initialized. Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables.',
      });
    }

    const decodedToken = await firebaseAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Token verification failed');
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export { firestore, firebaseAuth };
