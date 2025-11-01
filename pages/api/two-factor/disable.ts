/**
 * API Route: Disable Two-Factor Authentication
 * POST: Disable 2FA after verification
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAuthToken } from '../../../lib/apiAuth';
import { getFirestore, getApps, initializeApp, cert, getFirestore as getAdminFirestore } from 'firebase-admin/app';
import { verifyTwoFactorToken, verifyBackupCode, isValidTokenFormat, isValidBackupCodeFormat } from '../../../lib/twoFactorAuth';

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

    if (req.method === 'POST') {
      const { token, backupCode } = req.body;
      const userDocRef = db.collection('users').doc(user.uid);
      const userDoc = await userDocRef.get();
      const userData = userDoc.data();

      if (!userData?.twoFactor?.enabled) {
        return res.status(400).json({ error: '2FA is not enabled for this account' });
      }

      // Verify token or backup code before disabling
      let verified = false;

      if (token) {
        if (!isValidTokenFormat(token)) {
          return res.status(400).json({ error: 'Invalid token format' });
        }
        verified = verifyTwoFactorToken(userData.twoFactor.secret, token);
      } else if (backupCode) {
        if (!isValidBackupCodeFormat(backupCode)) {
          return res.status(400).json({ error: 'Invalid backup code format' });
        }
        verified = verifyBackupCode(backupCode, userData.twoFactor.backupCodes || []);
      } else {
        return res.status(400).json({ error: 'Token or backup code required' });
      }

      if (!verified) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      // Disable 2FA
      await userDocRef.set({
        twoFactor: {
          enabled: false,
        }
      }, { merge: true });

      return res.status(200).json({
        success: true,
        enabled: false,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('2FA Disable API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

