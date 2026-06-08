/**
 * User File Storage Hook
 *
 * Core data management layer that bridges IPFS (content) and Firestore (metadata).
 * File lists are stored as IPFS objects (ensuring data portability), with Firestore
 * acting as a fast index. This hybrid approach provides censorship resistance while
 * maintaining good UX through caching and indexing.
 *
 * This file is the public entry point. The domain logic is split into focused
 * composed sub-hooks under hooks/storage/. This hook owns the SHARED state
 * (uploadedFiles, loading, error, fileVersions) and the persistence layer
 * (loadUserFiles, saveUserFiles, syncFilesToFirestore, fetchFromIPFS,
 * addActivityLog), then composes the domain hooks and spreads their returns so
 * the public API is byte-for-byte identical to before the split.
 */

import { useState, useEffect, useRef } from 'react';
import { AppError } from '../lib/errorHandler';
import { FileVersion } from '../lib/versionHistory';

import { UploadedFile, ActivityLog } from './storage/types';
import { useFilePersistence } from './storage/useFilePersistence';
import { usePinning } from './storage/usePinning';
import { useFolders } from './storage/useFolders';
import { useTrash } from './storage/useTrash';
import { useFileViews } from './storage/useFileViews';
import { useSharing } from './storage/useSharing';
import { useTags } from './storage/useTags';
import { useCustomProperties } from './storage/useCustomProperties';
import { useFileCrud } from './storage/useFileCrud';

// Re-export types that consumers import from this module.
export type { UploadedFile, ShareConfig, ActivityLog, FileOrFolder, UserFileList } from './storage/types';

export const useUserFileStorage = (userUid: string | null, getAuthToken?: () => Promise<string | null>) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [fileVersions, setFileVersions] = useState<FileVersion[]>([]); // Store file versions

  // Persistence layer (IPFS + Firestore). The auto-pin preference read during
  // load is handed to the pinning domain via a ref, since pinning is composed
  // after persistence (it needs saveUserFiles) yet the loader needs pinning's
  // setter — the ref breaks that cycle without changing behaviour.
  const setAutoPinEnabledRef = useRef<((enabled: boolean) => void) | null>(null);
  const { saveUserFiles, loadUserFiles } = useFilePersistence({
    userUid,
    getAuthToken,
    setUploadedFiles,
    setLoading,
    setError,
    setAutoPinEnabledRef,
  });

  // Add activity log entry
  const addActivityLog = async (index: number, action: ActivityLog['action'], details?: string) => {
    const updatedFiles = [...uploadedFiles];
    const file = updatedFiles[index];

    const logEntry: ActivityLog = {
      timestamp: Date.now(),
      action,
      userId: userUid || undefined,
      details
    };

    file.activityLog = [logEntry, ...(file.activityLog || [])].slice(0, 50); // Keep last 50 entries

    setUploadedFiles(updatedFiles);
    // Background save - don't await
    saveUserFiles(updatedFiles).catch(console.error);
  };

  // Pinning domain (owns autoPinEnabled, pinningWarning, and the service resolver
  // reused by trash).
  const pinning = usePinning({
    userUid,
    getAuthToken,
    uploadedFiles,
    setUploadedFiles,
    saveUserFiles,
    setError,
  });

  // Wire the loader's auto-pin callback now that pinning exists (see ref above).
  // Done in an effect (not during render) so the ref is mutated as a side effect;
  // this effect is defined before the mount-load effect below, so the callback is
  // in place before loadUserFiles first runs.
  useEffect(() => {
    setAutoPinEnabledRef.current = pinning.setAutoPinEnabledState;
  });

  // Folder navigation + structural operations (owns currentFolderId).
  const folders = useFolders({
    uploadedFiles,
    setUploadedFiles,
    saveUserFiles,
    getAuthToken,
  });

  // Trash lifecycle (reuses the pinning-service resolver for unpinning).
  const trash = useTrash({
    uploadedFiles,
    setUploadedFiles,
    saveUserFiles,
    getAuthToken,
    resolvePinningService: pinning.resolvePinningService,
  });

  // Derived views + sorting preferences (needs the current folder id).
  const views = useFileViews({
    uploadedFiles,
    setUploadedFiles,
    saveUserFiles,
    currentFolderId: folders.currentFolderId,
  });

  // Sharing operations (needs the activity logger).
  const sharing = useSharing({
    userUid,
    getAuthToken,
    uploadedFiles,
    setUploadedFiles,
    saveUserFiles,
    addActivityLog,
  });

  // Tagging operations.
  const tags = useTags({
    uploadedFiles,
    setUploadedFiles,
    saveUserFiles,
    addActivityLog,
    setError,
  });

  // Custom property operations.
  const customProperties = useCustomProperties({
    uploadedFiles,
    setUploadedFiles,
    saveUserFiles,
    addActivityLog,
    setError,
  });

  // File CRUD + duplicates + version persistence (refresh delegates to the loader).
  const fileCrud = useFileCrud({
    userUid,
    getAuthToken,
    uploadedFiles,
    setUploadedFiles,
    saveUserFiles,
    loadUserFiles,
    fileVersions,
    setFileVersions,
    currentFolderId: folders.currentFolderId,
    addActivityLog,
    setError,
  });

  // Load files when user changes
  useEffect(() => {
    if (userUid) {
      loadUserFiles();
    } else {
      setUploadedFiles([]);
    }
  }, [userUid]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    uploadedFiles,
    loading,
    error,
    clearError: () => setError(null),
    addFiles: fileCrud.addFiles,
    removeFile: fileCrud.removeFile,
    clearAllFiles: fileCrud.clearAllFiles,
    refreshFiles: fileCrud.refreshFiles,
    // Pinning functions
    pinFile: pinning.pinFile,
    unpinFile: pinning.unpinFile,
    setPinExpiry: pinning.setPinExpiry,
    pinningWarning: pinning.pinningWarning,
    autoPinEnabled: pinning.autoPinEnabled,
    setAutoPinEnabled: pinning.setAutoPinEnabled,
    getStorageStats: pinning.getStorageStats,
    // Folder functions
    currentFolderId: folders.currentFolderId,
    setCurrentFolderId: folders.setCurrentFolderId,
    createFolder: folders.createFolder,
    renameItem: folders.renameItem,
    moveItem: folders.moveItem,
    // Organization functions
    toggleStarred: views.toggleStarred,
    moveToTrash: trash.moveToTrash,
    restoreFromTrash: trash.restoreFromTrash,
    permanentlyDelete: trash.permanentlyDelete,
    autoCleanupTrash: trash.autoCleanupTrash,
    updateLastAccessed: trash.updateLastAccessed,
    // View functions
    getCurrentFolderItems: views.getCurrentFolderItems,
    getRecentFiles: views.getRecentFiles,
    getStarredItems: views.getStarredItems,
    getTrashedItems: views.getTrashedItems,
    getFolderPath: folders.getFolderPath,
    // Sorting
    sortBy: views.sortBy,
    setSortBy: views.setSortBy,
    sortDirection: views.sortDirection,
    setSortDirection: views.setSortDirection,
    sortEnabled: views.sortEnabled,
    setSortEnabled: views.setSortEnabled,
    // Sharing functions (Phase 3)
    enableSharing: sharing.enableSharing,
    disableSharing: sharing.disableSharing,
    updateShareConfig: sharing.updateShareConfig,
    getFileByShareId: sharing.getFileByShareId,
    recordShareAccess: sharing.recordShareAccess,
    getSharedFiles: sharing.getSharedFiles,
    addActivityLog,
    // Duplicate functions
    checkDuplicates: fileCrud.checkDuplicates,
    duplicateFile: fileCrud.duplicateFile,
    getFileDuplicates: fileCrud.getFileDuplicates,
    // Tag functions
    addTags: tags.addTags,
    removeTags: tags.removeTags,
    setTags: tags.setTags,
    getAllTags: tags.getAllTags,
    getFilesByTag: tags.getFilesByTag,
    // Custom Properties functions
    updateCustomProperties: customProperties.updateCustomProperties,
    setCustomProperty: customProperties.setCustomProperty
  };
};
