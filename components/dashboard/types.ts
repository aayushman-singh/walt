/**
 * Shared types for the dashboard presentation layer.
 *
 * The canonical UploadedFile / ShareConfig live in the storage hook
 * (hooks/storage/types.ts) and are re-exported from hooks/useUserFileStorage.
 * We re-export them here so the extracted dashboard components consume the
 * exact same types as the data source, avoiding type drift.
 */

export type { UploadedFile, ShareConfig } from '../../hooks/useUserFileStorage';

export interface UploadProgress {
  name: string;
  progress: number;
  status: 'uploading' | 'complete' | 'error';
}

export type ActiveView = 'drive' | 'recent' | 'starred' | 'trash' | 'shared';
export type ViewMode = 'grid' | 'list';

export interface DashboardFilters {
  fileType: 'all' | 'image' | 'video' | 'audio' | 'document' | 'folder' | 'other';
  pinStatus: 'all' | 'pinned' | 'unpinned';
  starStatus: 'all' | 'starred' | 'unstarred';
  tags: string[];
  sizeMin: string;
  sizeMax: string;
  dateFrom: string;
  dateTo: string;
}

export type VisibleColumns = {
  name: boolean;
  size: boolean;
  type: boolean;
  modified: boolean;
  pinStatus: boolean;
  tags: boolean;
  starStatus: boolean;
};

export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  progress?: number;
}

export interface ConfirmationModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  type?: 'warning' | 'danger' | 'info';
  showSuppressOption?: boolean;
  onSuppressChange?: (suppress: boolean) => void;
}

export interface InputModalState {
  isOpen: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  /** Render a masked input when 'password' (defaults to plain text). */
  type?: 'text' | 'password';
  onConfirm: (value: string) => void;
  /** Optional cancel handler; falls back to closing the modal when omitted. */
  onCancel?: () => void;
}

export interface DuplicateFileModalState {
  isOpen: boolean;
  fileName: string;
  newFile: import('../../hooks/useUserFileStorage').UploadedFile | null;
  existingFileIndex: number | null;
  onResolve: (action: 'replace' | 'keepBoth' | 'cancel') => void;
  hasMultipleDuplicates?: boolean;
  remainingCount?: number;
  onYesToAll?: (action: 'replace' | 'keepBoth') => void;
  onNoToAll?: () => void;
}

export interface SavedSearch {
  name: string;
  query: string;
  filters: DashboardFilters;
}
