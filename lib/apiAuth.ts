import { NextApiRequest } from 'next';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

let adminApp: App | null = null;
let adminAuth: Auth | null = null;

// Initialize Firebase Admin if not already initialized
function initializeFirebaseAdmin() {
  if (adminAuth) return adminAuth;

  try {
    // Check if app already exists
    const existingApps = getApps();
    if (existingApps.length > 0) {
      adminApp = existingApps[0];
      adminAuth = getAuth(adminApp);
      return adminAuth;
    }

    // Initialize new app
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccount) {
      adminApp = initializeApp({
        credential: cert(JSON.parse(serviceAccount))
      });
    } else {
      // Fallback: Try to use default credentials (for Firebase hosting/cloud functions)
      try {
        adminApp = initializeApp({});
      } catch (e) {
        console.warn('FIREBASE_SERVICE_ACCOUNT not set and default credentials unavailable. API routes may not work properly.');
        return null;
      }
    }

    if (adminApp) {
      adminAuth = getAuth(adminApp);
      return adminAuth;
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }

  return null;
}

export async function verifyAuthToken(req: NextApiRequest): Promise<{ uid: string; email: string } | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Initialize admin if needed
    const auth = initializeFirebaseAdmin();
    if (!auth) {
      console.error('Firebase Admin not initialized');
      return null;
    }

    const decodedToken = await auth.verifyIdToken(token);
    
    return {
      uid: decodedToken.uid,
      email: decodedToken.email || ''
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

