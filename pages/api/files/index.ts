import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAuthToken } from '../../../lib/apiAuth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

interface FileMetadata {
  id: string;
  name: string;
  ipfsUri: string;
  gatewayUrl: string;
  timestamp: number;
  type: string;
  size?: number;
  isPinned?: boolean;
  pinService?: string;
  pinDate?: number;
  parentFolderId?: string | null;
  isFolder?: boolean;
  starred?: boolean;
  trashed?: boolean;
  trashedDate?: number;
  modifiedDate?: number;
  shareConfig?: any;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify authentication
  const user = await verifyAuthToken(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Initialize Firestore Admin if needed
    let db;
    try {
      if (getApps().length === 0) {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (serviceAccount) {
          initializeApp({
            credential: cert(JSON.parse(serviceAccount))
          });
        } else {
          initializeApp({});
        }
      }
      db = getFirestore();
    } catch (error: any) {
      return res.status(500).json({ 
        error: 'Firebase Admin not initialized',
        message: error.message 
      });
    }

    if (req.method === 'GET') {
      // Get user's file list
      const userDocRef = db.collection('users').doc(user.uid);
      const userDoc = await userDocRef.get();

      if (!userDoc.exists) {
        return res.status(200).json({ files: [] });
      }

      const userData = userDoc.data();
      const fileListUri = userData?.fileListUri;

      if (!fileListUri) {
        return res.status(200).json({ files: [] });
      }

      // Fetch from IPFS (or return the URI for client-side fetch)
      return res.status(200).json({
        fileListUri,
        userId: user.uid
      });
    }

    if (req.method === 'POST') {
      // Create or update file metadata
      const { files, fileListUri } = req.body;

      if (!fileListUri || !Array.isArray(files)) {
        return res.status(400).json({ error: 'Missing fileListUri or files array' });
      }

      // Update Firestore with new file list URI
      const userDocRef = db.collection('users').doc(user.uid);
      await userDocRef.set({
        fileListUri,
        lastUpdated: Date.now(),
        userId: user.uid
      }, { merge: true });

      return res.status(200).json({ success: true, fileListUri });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

