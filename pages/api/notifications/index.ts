/**
 * API Route: Notifications
 * GET: Get user's notifications
 * POST: Create a notification
 * PUT: Mark notification(s) as read
 * DELETE: Delete notification(s)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAuthToken } from '../../../lib/apiAuth';
import { getApps, initializeApp, cert, getFirestore as getAdminFirestore } from 'firebase-admin/app';
import { Notification } from '../../../lib/notifications';

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

    const notificationsCollectionRef = db.collection('users').doc(user.uid).collection('notifications');

    if (req.method === 'GET') {
      // Get user's notifications
      const { limit = 50, unreadOnly = false } = req.query;

      let query = notificationsCollectionRef.orderBy('timestamp', 'desc');

      if (unreadOnly === 'true') {
        query = query.where('read', '==', false);
      }

      if (limit) {
        query = query.limit(parseInt(limit as string));
      }

      const snapshot = await query.get();
      const notifications: Notification[] = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        notifications.push({
          id: doc.id,
          type: data.type,
          title: data.title,
          message: data.message,
          timestamp: data.timestamp,
          read: data.read || false,
          userId: data.userId,
          relatedFileId: data.relatedFileId,
          relatedShareId: data.relatedShareId,
          actionUrl: data.actionUrl,
          metadata: data.metadata,
        });
      });

      // Count unread
      const unreadSnapshot = await notificationsCollectionRef
        .where('read', '==', false)
        .get();
      const unreadCount = unreadSnapshot.size;

      return res.status(200).json({
        notifications,
        unreadCount,
      });
    }

    if (req.method === 'POST') {
      // Create a notification
      const { notification } = req.body;

      if (!notification || !notification.type || !notification.title || !notification.message) {
        return res.status(400).json({ error: 'Invalid notification data' });
      }

      const notificationData = {
        ...notification,
        userId: user.uid,
        timestamp: notification.timestamp || Date.now(),
        read: notification.read || false,
        createdAt: Date.now(),
      };

      const docRef = await notificationsCollectionRef.add(notificationData);

      return res.status(200).json({
        success: true,
        notification: {
          id: docRef.id,
          ...notificationData,
        },
      });
    }

    if (req.method === 'PUT') {
      // Mark notification(s) as read
      const { notificationIds, markAllRead = false } = req.body;

      if (markAllRead) {
        // Mark all as read
        const unreadSnapshot = await notificationsCollectionRef
          .where('read', '==', false)
          .get();

        const batch = db.batch();
        unreadSnapshot.forEach(doc => {
          batch.update(doc.ref, { read: true, readAt: Date.now() });
        });
        await batch.commit();

        return res.status(200).json({
          success: true,
          markedRead: unreadSnapshot.size,
        });
      } else if (notificationIds && Array.isArray(notificationIds)) {
        // Mark specific notifications as read
        const batch = db.batch();
        notificationIds.forEach((id: string) => {
          const docRef = notificationsCollectionRef.doc(id);
          batch.update(docRef, { read: true, readAt: Date.now() });
        });
        await batch.commit();

        return res.status(200).json({
          success: true,
          markedRead: notificationIds.length,
        });
      }

      return res.status(400).json({ error: 'Invalid request' });
    }

    if (req.method === 'DELETE') {
      // Delete notification(s)
      const { notificationIds } = req.body;

      if (!notificationIds || !Array.isArray(notificationIds)) {
        return res.status(400).json({ error: 'Invalid notification IDs' });
      }

      const batch = db.batch();
      notificationIds.forEach((id: string) => {
        const docRef = notificationsCollectionRef.doc(id);
        batch.delete(docRef);
      });
      await batch.commit();

      return res.status(200).json({
        success: true,
        deleted: notificationIds.length,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Notifications API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

