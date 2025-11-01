/**
 * Notification Center Component
 * Displays user notifications with ability to mark as read and delete
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Notification, 
  formatNotificationTime, 
  getNotificationIcon, 
  getNotificationColor 
} from '../lib/notifications';
import styles from '../styles/NotificationCenter.module.css';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && user) {
      loadNotifications();
    }
  }, [isOpen, user]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  const loadNotifications = async () => {
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notifications', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load notifications');
      }

      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load notifications');
      console.error('Notification load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notifications', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationIds: [notificationId] }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark as read');
      }

      // Update local state
      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notifications', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ markAllRead: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark all as read');
      }

      // Update local state
      setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationIds: [notificationId] }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }

      // Update local state
      setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
      const deleted = notifications.find(n => n.id === notificationId);
      if (deleted && !deleted.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      markAsRead(notification.id);
    }

    // Navigate if actionUrl exists
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
      onClose();
    }
  };

  if (!isOpen) return null;

  const unreadNotifications = notifications.filter(n => !n.read);
  const readNotifications = notifications.filter(n => n.read);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} ref={modalRef}>
        <div className={styles.header}>
          <div>
            <h2>Notifications</h2>
            {unreadCount > 0 && (
              <span className={styles.unreadBadge}>{unreadCount} unread</span>
            )}
          </div>
          <div className={styles.headerActions}>
            {unreadCount > 0 && (
              <button
                className={styles.markAllReadBtn}
                onClick={markAllAsRead}
                title="Mark all as read"
              >
                Mark all read
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading notifications...</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : notifications.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>🔔</div>
              <p>No notifications</p>
              <p className={styles.emptySubtext}>You're all caught up!</p>
            </div>
          ) : (
            <>
              {unreadNotifications.length > 0 && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Unread</h3>
                  <div className={styles.notificationsList}>
                    {unreadNotifications.map(notification => {
                      const icon = getNotificationIcon(notification.type);
                      const color = getNotificationColor(notification.type);

                      return (
                        <div
                          key={notification.id}
                          className={`${styles.notificationItem} ${notification.read ? styles.read : styles.unread}`}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className={styles.notificationIcon} style={{ color }}>
                            {icon}
                          </div>
                          <div className={styles.notificationContent}>
                            <div className={styles.notificationHeader}>
                              <h4 className={styles.notificationTitle}>{notification.title}</h4>
                              <span className={styles.notificationTime}>
                                {formatNotificationTime(notification.timestamp)}
                              </span>
                            </div>
                            <p className={styles.notificationMessage}>{notification.message}</p>
                          </div>
                          <div className={styles.notificationActions}>
                            {!notification.read && (
                              <button
                                className={styles.actionBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notification.id);
                                }}
                                title="Mark as read"
                              >
                                ✓
                              </button>
                            )}
                            <button
                              className={styles.deleteBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notification.id);
                              }}
                              title="Delete"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {readNotifications.length > 0 && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Read</h3>
                  <div className={styles.notificationsList}>
                    {readNotifications.map(notification => {
                      const icon = getNotificationIcon(notification.type);
                      const color = getNotificationColor(notification.type);

                      return (
                        <div
                          key={notification.id}
                          className={`${styles.notificationItem} ${notification.read ? styles.read : styles.unread}`}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className={styles.notificationIcon} style={{ color }}>
                            {icon}
                          </div>
                          <div className={styles.notificationContent}>
                            <div className={styles.notificationHeader}>
                              <h4 className={styles.notificationTitle}>{notification.title}</h4>
                              <span className={styles.notificationTime}>
                                {formatNotificationTime(notification.timestamp)}
                              </span>
                            </div>
                            <p className={styles.notificationMessage}>{notification.message}</p>
                          </div>
                          <div className={styles.notificationActions}>
                            {!notification.read && (
                              <button
                                className={styles.actionBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notification.id);
                                }}
                                title="Mark as read"
                              >
                                ✓
                              </button>
                            )}
                            <button
                              className={styles.deleteBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notification.id);
                              }}
                              title="Delete"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;

