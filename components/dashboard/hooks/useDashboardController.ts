/**
 * Dashboard controller hook
 *
 * Owns all page-level state and composes every dashboard domain hook (storage,
 * billing, search, file ops, upload, bulk ops, sharing/tags, versions, export,
 * keyboard shortcuts, effects). The dashboard page consumes this and renders —
 * keeping the page a thin view. Behaviour is identical to the previous inline
 * wiring; this only relocates the controller logic out of the page component.
 */
import { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../../../contexts/AuthContext';
import { useUserFileStorage } from '../../../hooks/useUserFileStorage';
import styles from '../../../styles/Dashboard.module.css';

import {
  UploadedFile,
  ActiveView,
  ViewMode,
  DashboardFilters,
  VisibleColumns,
  ToastState,
  ConfirmationModalState,
  InputModalState,
  DuplicateFileModalState,
} from '../types';
import { useSearch } from './useSearch';
import { useBilling } from './useBilling';
import { useUpload } from './useUpload';
import { useBulkOperations } from './useBulkOperations';
import { useFileOperations } from './useFileOperations';
import { useShareTags } from './useShareTags';
import { useVersionHistory } from './useVersionHistory';
import { useExport } from './useExport';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useFilteredFiles } from './useFilteredFiles';
import { useDashboardEffects } from './useDashboardEffects';

export const useDashboardController = () => {
  // --- Page-level UI state ---------------------------------------------------
  const uploadedFilesRef = useRef<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isFileInputProcessingRef = useRef<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<ActiveView>('drive');
  // Declared in the original component and intentionally preserved (unused).
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showStorageCleanup, setShowStorageCleanup] = useState(false);
  const [cleanupMode, setCleanupMode] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showGatewaySettings, setShowGatewaySettings] = useState(false);
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>({
    name: true,
    size: true,
    type: true,
    modified: true,
    pinStatus: true,
    tags: true,
    starStatus: true,
  });
  const [filters, setFilters] = useState<DashboardFilters>({
    fileType: 'all',
    pinStatus: 'all',
    starStatus: 'all',
    tags: [],
    sizeMin: '',
    sizeMax: '',
    dateFrom: '',
    dateTo: '',
  });
  const [toast, setToast] = useState<ToastState | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isDragging, setIsDragging] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [inputModal, setInputModal] = useState<InputModalState>({
    isOpen: false,
    title: '',
    onConfirm: () => {}
  });
  const [duplicateFileModal, setDuplicateFileModal] = useState<DuplicateFileModalState>({
    isOpen: false,
    fileName: '',
    newFile: null,
    existingFileIndex: null,
    onResolve: () => {},
    hasMultipleDuplicates: false,
    remainingCount: 0
  });

  // --- Encryption session state (in-memory only; never persisted) -----------
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [encryptionPassphrase, setEncryptionPassphrase] = useState<string | null>(null);

  // Returns the stored passphrase if set; otherwise prompts via the input modal
  // (masked password field) and remembers the entered value for the session.
  // Cancel/empty resolves null — the caller must treat that as "no passphrase".
  // Promise-wrapping mirrors useUpload.resolveDuplicates' modal pattern.
  const ensureEncryptionPassphrase = (): Promise<string | null> => {
    if (encryptionPassphrase) {
      return Promise.resolve(encryptionPassphrase);
    }
    return new Promise<string | null>((resolve) => {
      let resolved = false;
      setInputModal({
        isOpen: true,
        title: 'Enter encryption passphrase',
        message: 'This passphrase encrypts and decrypts your files. It is kept only in memory for this session and is never sent anywhere. If you lose it, the files cannot be recovered.',
        placeholder: 'Passphrase',
        defaultValue: '',
        type: 'password',
        onConfirm: (value: string) => {
          if (resolved) return;
          resolved = true;
          setInputModal(prev => ({ ...prev, isOpen: false }));
          const trimmed = value?.trim();
          if (!trimmed) {
            resolve(null);
            return;
          }
          setEncryptionPassphrase(trimmed);
          resolve(trimmed);
        },
        onCancel: () => {
          if (resolved) return;
          resolved = true;
          setInputModal(prev => ({ ...prev, isOpen: false }));
          resolve(null);
        },
      });
    });
  };

  // Turning encryption ON requires a passphrase; if the user cancels the prompt
  // we revert to OFF rather than enable encryption without a key.
  const toggleEncryption = async (next: boolean) => {
    if (!next) {
      setEncryptionEnabled(false);
      return;
    }
    if (encryptionPassphrase) {
      setEncryptionEnabled(true);
      return;
    }
    const passphrase = await ensureEncryptionPassphrase();
    setEncryptionEnabled(!!passphrase);
  };

  const router = useRouter();
  const { user, loading, logout } = useAuth();

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success', title?: string, progress?: number) => {
    setToast({ message, type, title, progress });
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Use the IPFS-backed storage hook
  const {
    uploadedFiles,
    loading: filesLoading,
    addFiles,
    removeFile,
    clearAllFiles,
    pinFile,
    unpinFile,
    pinningWarning,
    autoPinEnabled,
    setAutoPinEnabled,
    getStorageStats,
    // Folder functions
    currentFolderId,
    setCurrentFolderId,
    createFolder,
    renameItem,
    moveItem,
    // Organization functions
    toggleStarred,
    moveToTrash,
    restoreFromTrash,
    permanentlyDelete,
    autoCleanupTrash,
    updateLastAccessed,
    // View functions
    getCurrentFolderItems,
    getRecentFiles,
    getStarredItems,
    getTrashedItems,
    getFolderPath,
    // Sorting
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    // Sharing functions
    enableSharing,
    disableSharing,
    addActivityLog,
    // Duplicate functions
    duplicateFile,
    // Tag functions
    addTags,
    removeTags,
    getAllTags,
    // Custom Properties functions
    updateCustomProperties
  } = useUserFileStorage(user?.uid || null, async () => {
    if (user) {
      return await user.getIdToken();
    }
    return null;
  });

  // --- Domain hooks ----------------------------------------------------------
  const billing = useBilling({ user });

  const search = useSearch({
    user,
    uploadedFiles,
    searchTerm,
    setSearchTerm,
    filters,
    setFilters,
    showToast,
    setInputModal,
  });

  const fileOps = useFileOperations({
    uploadedFiles,
    currentFolderId,
    activeView,
    setActiveView,
    setCurrentFolderId,
    fileInputRef,
    isFileInputProcessingRef,
    showToast,
    setConfirmationModal,
    setInputModal,
    checkBillingAccess: billing.checkBillingAccess,
    removeFile,
    clearAllFiles,
    pinFile,
    unpinFile,
    createFolder,
    renameItem,
    toggleStarred,
    moveToTrash,
    restoreFromTrash,
    permanentlyDelete,
    updateLastAccessed,
    addActivityLog,
    duplicateFile,
    ensureDecryptionPassphrase: ensureEncryptionPassphrase,
  });

  const versionHistory = useVersionHistory({
    user,
    uploadedFiles,
    renameItem,
    addFiles,
    showToast,
  });

  const shareTags = useShareTags({
    uploadedFiles,
    showToast,
    enableSharing,
    disableSharing,
    addTags,
    removeTags,
  });

  const exporter = useExport({ uploadedFiles, showToast });

  const upload = useUpload({
    user,
    uploadedFiles,
    uploadedFilesRef,
    currentFolderId,
    autoPinEnabled,
    addFiles,
    removeFile,
    moveItem,
    showToast,
    setConfirmationModal,
    confirmationModal,
    setDuplicateFileModal,
    checkBillingAccess: billing.checkBillingAccess,
    setIsDragging,
    encryptionEnabled,
    ensureEncryptionPassphrase,
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: upload.onDrop,
    multiple: true,
    noClick: false
  });

  // --- Derived view data -----------------------------------------------------
  const filteredFiles = useFilteredFiles({
    uploadedFiles,
    searchTerm,
    activeView,
    filters,
    getRecentFiles,
    getStarredItems,
    getTrashedItems,
    getCurrentFolderItems,
  });

  // Bulk operations depend on filteredFiles, so this hook comes after it.
  const bulk = useBulkOperations({
    uploadedFiles,
    uploadedFilesRef,
    filteredFiles,
    getTrashedItems,
    restoreFromTrash,
    moveToTrash,
    permanentlyDelete,
    handleDownload: fileOps.handleDownload,
    showToast,
    setConfirmationModal,
  });
  const { selectedFiles, setSelectedFiles } = bulk;

  useKeyboardShortcuts({
    styles,
    searchTerm,
    setSearchTerm,
    showFilters,
    activeView,
    setActiveView,
    theme,
    setTheme,
    setViewMode,
    setShowSuggestions: search.setShowSuggestions,
    setCurrentFolderId,
    currentFolderId,
    createFolder,
    showToast,
    confirmationModal,
    setConfirmationModal,
    inputModal,
    setInputModal,
    shareModalFile: shareTags.shareModalFile,
    setShareModalFile: shareTags.setShareModalFile,
  });

  useDashboardEffects({
    uploadedFiles,
    uploadedFilesRef,
    activeView,
    cleanupMode,
    setCleanupMode,
    setSelectedFiles,
    visibleColumns,
    setVisibleColumns,
    loading,
    user,
    router,
    pinningWarning,
    showToast,
    autoCleanupTrash,
    currentFolderId,
    setCurrentFolderId,
    isDragging,
    setIsDragging,
  });

  const storageStats = getStorageStats();
  const folderPath = getFolderPath(currentFolderId);

  return {
    // page chrome / auth
    styles, router, user, authLoading: loading, handleLogout, showToast, theme, setTheme,
    // ui state
    viewMode, setViewMode, searchTerm, setSearchTerm, activeView, setActiveView,
    showStorageCleanup, setShowStorageCleanup, cleanupMode, setCleanupMode,
    showFilters, setShowFilters, showColumnSettings, setShowColumnSettings,
    showGatewaySettings, setShowGatewaySettings, showTwoFactorSetup, setShowTwoFactorSetup,
    visibleColumns, setVisibleColumns, filters, setFilters,
    toast, setToast, isDragging, setIsDragging,
    showKeyboardShortcuts, setShowKeyboardShortcuts, showMobileMenu, setShowMobileMenu,
    confirmationModal, setConfirmationModal, inputModal, setInputModal, duplicateFileModal,
    fileInputRef, isFileInputProcessingRef,
    // storage primitives used by the view
    uploadedFiles, filesLoading, pinningWarning, autoPinEnabled, setAutoPinEnabled,
    encryptionEnabled, toggleEncryption,
    getAllTags, currentFolderId, setCurrentFolderId,
    sortBy, setSortBy, sortDirection, setSortDirection,
    permanentlyDelete, updateCustomProperties, getTrashedItems, autoCleanupTrash,
    storageStats, folderPath,
    // dropzone
    getRootProps, getInputProps, isDragActive,
    // derived + domain hooks
    filteredFiles, selectedFiles, setSelectedFiles,
    billing, search, fileOps, versionHistory, shareTags, exporter, upload, bulk,
  };
};
