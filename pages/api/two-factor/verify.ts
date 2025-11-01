/**
 * API Route: Verify Two-Factor Authentication Token
 * POST: Verify 2FA token during login
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAuthToken } from '../../../lib/apiAuth';
import { getFirestore, getApps, initializeApp, cert, getFirestore as getAdminFirestore } from 'firebase-admin/app';
import { verifyTwoFactorToken, verifyBackupCode, isValidTokenFormat, isValidBackupCodeFormat } from '../../../lib/twoFactorAuth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // For 2FA verification during login, we need to accept the session token
  // This is a simplified approach - in production, you'd want a more secure flow
  const user = await verifyAuthToken(req);
  
  if (!user) {
    // Try to get user from session if provided
    const { userId, token, backupCode } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Initialize Firestore Admin
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
        const userDocRef = db.collection('users').doc(userId);
        const userDoc = await userDocRef.get();
        const userData = userDoc.data();

        if (!userData?.twoFactor?.enabled) {
          return res.status(400).json({ error: '2FA is not enabled for this account' });
        }

        // Verify token or backup code
        if (token) {
          if (!isValidTokenFormat(token)) {
            return res.status(400).json({ error: 'Invalid token format' });
          }

          const isValid = verifyTwoFactorToken(userData.twoFactor.secret, token);

          if (!isValid) {
            return res.status(400).json({ error: 'Invalid 2FA token' });
          }

          return res.status(200).json({ success: true, verified: true });
        }

        if (backupCode) {
          if (!isValidBackupCodeFormat(backupCode)) {
            return res.status(400).json({ error: 'Invalid backup code format' });
          }

          const isValid = verifyBackupCode(backupCode, userData.twoFactor.backupCodes || []);

          if (!isValid) {
            return res.status(400).json({ error: 'Invalid backup code' });
          }

          // Remove used backup code
          const updatedBackupCodes = userData.twoFactor.backupCodes.filter(
            (code: string) => code.replace(/\s+/g, '').toUpperCase() !== backupCode.replace(/\s+/g, '').toUpperCase()
          );

          await userDocRef.set({
            twoFactor: {
              ...userData.twoFactor,
              backupCodes: updatedBackupCodes,
            }
          }, { merge: true });

          return res.status(200).json({ success: true, verified: true, backupCodeUsed: true });
        }

        return res.status(400).json({ error: 'Either token or backupCode must be provided' });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    } catch (error: any) {
      console.error('2FA Verify API Error:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  }

  // If user is already authenticated, they might be verifying for a different purpose
  // For now, require token or backupCode
  return res.status(400).json({ error: 'Token or backup code required' });
}

