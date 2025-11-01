/**
 * Notification Bell Component
 * Bell icon with unread count badge
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import NotificationCenter from './NotificationCenter';
import styles from '../styles/NotificationBell.module.css';

const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (user) {
      loadUnreadCount();
      
      // Poll for new notifications every 30 seconds
      const interval = setInterval(() => {
        loadUnreadCount();
      }, 30000);
      
      setPollingInterval(interval);

      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const loadUnreadCount = async () => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notifications?unreadOnly=true&limit=0', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      // Silently fail - don't disturb user
      console.error('Failed to load unread count:', err);
    }
  };

  const handleClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      // Reload notifications when opening
      loadUnreadCount();
    }
  };

  const handleNotificationCenterClose = () => {
    setIsOpen(false);
    // Reload count after closing
    loadUnreadCount();
  };

  if (!user) return null;

  return (
    <>
      <button
        className={styles.bellButton}
        onClick={handleClick}
        title="Notifications"
      >
        <span className={styles.bellIcon}>🔔</span>
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationCenter
          isOpen={isOpen}
          onClose={handleNotificationCenterClose}
        />
      )}
    </>
  );
};

export default NotificationBell;

