/**
 * API Route: Get File Versions
 * GET: Retrieve all versions for a file
 * POST: Create a new version or restore a version
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAuthToken } from '../../../lib/apiAuth';
import { getApps, initializeApp, cert, getFirestore as getAdminFirestore } from 'firebase-admin/app';
import { FileVersion } from '../../../lib/versionHistory';

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
      db = getAdminFirestore();
    } catch (error: any) {
      return res.status(500).json({ 
        error: 'Firebase Admin not initialized',
        message: error.message 
      });
    }

    const { fileId } = req.query;

    if (!fileId || typeof fileId !== 'string') {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    const versionsCollectionRef = db.collection('users').doc(user.uid).collection('fileVersions');

    if (req.method === 'GET') {
      // Get all versions for this file
      const versionsSnapshot = await versionsCollectionRef
        .where('fileId', '==', fileId)
        .orderBy('timestamp', 'desc')
        .get();

      const versions: FileVersion[] = [];
      versionsSnapshot.forEach(doc => {
        const data = doc.data();
        versions.push({
          fileId: data.fileId,
          versionId: data.versionId || doc.id,
          version: data.version,
          ipfsUri: data.ipfsUri,
          gatewayUrl: data.gatewayUrl,
          timestamp: data.timestamp,
          modifiedDate: data.modifiedDate,
          size: data.size,
          type: data.type,
          name: data.name,
          uploadedBy: data.uploadedBy,
          changeDescription: data.changeDescription,
        });
      });

      return res.status(200).json({
        fileId,
        versions,
      });
    }

    if (req.method === 'POST') {
      // Create a new version or restore
      const { version } = req.body;

      if (!version || !version.ipfsUri) {
        return res.status(400).json({ error: 'Invalid version data' });
      }

      // Create version document
      const versionData = {
        fileId,
        versionId: version.versionId || `version_${fileId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        version: version.version || 1,
        ipfsUri: version.ipfsUri,
        gatewayUrl: version.gatewayUrl,
        timestamp: version.timestamp || Date.now(),
        modifiedDate: version.modifiedDate || Date.now(),
        size: version.size || null,
        type: version.type || 'unknown',
        name: version.name,
        uploadedBy: user.uid,
        changeDescription: version.changeDescription || null,
        createdAt: Date.now(),
      };

      await versionsCollectionRef.doc(versionData.versionId).set(versionData);

      return res.status(200).json({
        success: true,
        version: versionData,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Versions API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

