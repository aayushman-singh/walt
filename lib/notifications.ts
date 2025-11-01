/**
 * Notifications System
 * Manages in-app notifications for shares, comments, and activity
 */

export type NotificationType = 
  | 'share_received' 
  | 'share_access' 
  | 'file_shared'
  | 'comment_mentioned'
  | 'file_updated'
  | 'pin_expiring'
  | 'storage_warning'
  | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  userId: string;
  relatedFileId?: string;
  relatedShareId?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Create a notification
 */
export function createNotification(
  type: NotificationType,
  title: string,
  message: string,
  userId: string,
  options?: {
    relatedFileId?: string;
    relatedShareId?: string;
    actionUrl?: string;
    metadata?: Record<string, any>;
  }
): Notification {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    message,
    timestamp: Date.now(),
    read: false,
    userId,
    relatedFileId: options?.relatedFileId,
    relatedShareId: options?.relatedShareId,
    actionUrl: options?.actionUrl,
    metadata: options?.metadata,
  };
}

/**
 * Format notification timestamp
 */
export function formatNotificationTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Get notification icon based on type
 */
export function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case 'share_received':
    case 'file_shared':
      return '🔗';
    case 'share_access':
      return '👁️';
    case 'comment_mentioned':
      return '💬';
    case 'file_updated':
      return '📝';
    case 'pin_expiring':
      return '⚠️';
    case 'storage_warning':
      return '📦';
    case 'system':
      return '🔔';
    default:
      return '🔔';
  }
}

/**
 * Get notification color based on type
 */
export function getNotificationColor(type: NotificationType): string {
  switch (type) {
    case 'share_received':
    case 'file_shared':
      return '#1a73e8';
    case 'share_access':
      return '#34a853';
    case 'comment_mentioned':
      return '#fbbc04';
    case 'file_updated':
      return '#ea4335';
    case 'pin_expiring':
      return '#ff9800';
    case 'storage_warning':
      return '#ff5722';
    case 'system':
      return '#5f6368';
    default:
      return '#5f6368';
  }
}

