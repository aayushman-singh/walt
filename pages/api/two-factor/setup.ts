/**
 * API Route: Setup Two-Factor Authentication
 * GET: Get 2FA setup secret and QR code
 * POST: Enable 2FA after verification
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAuthToken } from '../../../lib/apiAuth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getApps, initializeApp, cert, getFirestore as getAdminFirestore } from 'firebase-admin/app';
import { generateTwoFactorSecret, verifyTwoFactorToken, isValidTokenFormat } from '../../../lib/twoFactorAuth';
import QRCode from 'qrcode';

interface TwoFactorSettings {
  enabled: boolean;
  secret?: string;
  backupCodes?: string[];
  setupDate?: number;
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
      db = getAdminFirestore();
    } catch (error: any) {
      return res.status(500).json({ 
        error: 'Firebase Admin not initialized',
        message: error.message 
      });
    }

    const userDocRef = db.collection('users').doc(user.uid);

    if (req.method === 'GET') {
      // Get current 2FA status or generate new setup
      const userDoc = await userDocRef.get();
      const userData = userDoc.data();

      // Check if 2FA is already enabled
      if (userData?.twoFactor?.enabled) {
        return res.status(200).json({
          enabled: true,
          message: '2FA is already enabled'
        });
      }

      // Generate new 2FA secret
      const twoFactorSecret = generateTwoFactorSecret(user.uid, user.email);

      // Generate QR code image data URL
      let qrCodeDataUrl: string;
      try {
        qrCodeDataUrl = await QRCode.toDataURL(twoFactorSecret.qrCodeUrl);
      } catch (error) {
        console.error('QR code generation error:', error);
        return res.status(500).json({ error: 'Failed to generate QR code' });
      }

      // Store the secret temporarily (encrypted in real production)
      // In production, you'd want to encrypt this before storing
      await userDocRef.set({
        twoFactor: {
          enabled: false,
          pendingSecret: twoFactorSecret.secret,
          pendingBackupCodes: twoFactorSecret.backupCodes,
          pendingSetupDate: Date.now(),
        }
      }, { merge: true });

      return res.status(200).json({
        enabled: false,
        secret: twoFactorSecret.secret,
        qrCodeUrl: twoFactorSecret.qrCodeUrl,
        qrCodeDataUrl,
        backupCodes: twoFactorSecret.backupCodes,
      });
    }

    if (req.method === 'POST') {
      // Enable 2FA after verification
      const { token } = req.body;

      if (!token || !isValidTokenFormat(token)) {
        return res.status(400).json({ error: 'Invalid token format' });
      }

      // Get pending 2FA setup
      const userDoc = await userDocRef.get();
      const userData = userDoc.data();

      if (!userData?.twoFactor?.pendingSecret) {
        return res.status(400).json({ error: 'No pending 2FA setup found' });
      }

      // Verify the token
      const isValid = verifyTwoFactorToken(userData.twoFactor.pendingSecret, token);

      if (!isValid) {
        return res.status(400).json({ error: 'Invalid verification token' });
      }

      // Enable 2FA
      await userDocRef.set({
        twoFactor: {
          enabled: true,
          secret: userData.twoFactor.pendingSecret, // In production, encrypt this
          backupCodes: userData.twoFactor.pendingBackupCodes,
          setupDate: Date.now(),
        }
      }, { merge: true });

      return res.status(200).json({
        success: true,
        enabled: true,
        backupCodes: userData.twoFactor.pendingBackupCodes,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('2FA Setup API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

