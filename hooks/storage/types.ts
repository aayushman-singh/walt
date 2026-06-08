/**
 * Shared types for the user file storage domain hooks.
 *
 * Extracted from hooks/useUserFileStorage.ts as part of the composition split.
 * These types are imported by every storage sub-hook and re-exported from the
 * public entry (hooks/useUserFileStorage.ts) so existing consumers keep working.
 */

import { AppError } from '../../lib/errorHandler';
import { FileVersion } from '../../lib/versionHistory';

export type { AppError };
export type { FileVersion };

export interface ShareConfig {
  shareId: string;
  enabled: boolean;
  createdDate: number;
  createdBy: string;
  permission: 'viewer' | 'editor';
  expiryDate?: number;
  password?: string;
  accessCount?: number;
  lastAccessedDate?: number;
  shortCode?: string;
  shortUrl?: string;
}

export interface ActivityLog {
  timestamp: number;
  action: 'created' | 'modified' | 'accessed' | 'shared' | 'unshared' | 'downloaded' | 'renamed' | 'starred' | 'unstarred' | 'trashed' | 'restored';
  userId?: string;
  userEmail?: string;
  details?: string;
}

export interface UploadedFile {
  id: string; // Unique identifier
  name: string;
  ipfsUri: string;
  gatewayUrl: string;
  timestamp: number;
  type: string;
  size?: number;
  // Pinning metadata
  isPinned?: boolean;
  pinService?: string;
  pinDate?: number;
  pinExpiry?: number;
  pinSize?: number;
  autoPinEnabled?: boolean;
  // Folder/organization metadata
  parentFolderId?: string | null; // null = root
  isFolder?: boolean;
  starred?: boolean;
  trashed?: boolean;
  trashedDate?: number;
  lastAccessed?: number;
  modifiedDate?: number;
  // Sharing metadata (Phase 3)
  shareConfig?: ShareConfig;
  activityLog?: ActivityLog[];
  // Tags/Labels
  tags?: string[];
  // Custom Properties/Metadata
  customProperties?: Record<string, string>;
  // Client-side encryption metadata (present iff the stored bytes are an
  // AES-GCM ciphertext produced by lib/encryption). Public — safe to store on
  // IPFS/Firestore; useless without the user's passphrase. See lib/encryption.
  encryption?: import('../../lib/encryption').EncryptionMeta;
}

// Helper type for cleaner code
export type FileOrFolder = UploadedFile;

export interface UserFileList {
  files: UploadedFile[];
  lastUpdated: number;
  userId: string;
}

export type SortBy = 'name' | 'date' | 'size' | 'type';
export type SortDirection = 'asc' | 'desc';
