/**
 * Trash domain hook.
 *
 * Soft-delete (trash), restore, permanent delete, auto-cleanup of old trash,
 * and last-accessed tracking. Receives shared file state, persistence, and the
 * pinning-service resolver (for unpinning on permanent delete / cleanup) from
 * the parent composition hook.
 */

import { getFileCache } from '../../lib/fileCache';
import { BackendFileAPI, BackendFolderAPI } from '../../lib/backendClient';
import { UploadedFile } from './types';
import { getPinningService } from '../../lib/pinningService';

type PinningServiceResolver = (suppressError?: boolean) => ReturnType<typeof getPinningService>;

interface UseTrashParams {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  saveUserFiles: (files: UploadedFile[]) => Promise<void>;
  getAuthToken?: () => Promise<string | null>;
  resolvePinningService: PinningServiceResolver;
}

export const useTrash = ({
  uploadedFiles,
  setUploadedFiles,
  saveUserFiles,
  getAuthToken,
  resolvePinningService,
}: UseTrashParams) => {
  // Move to trash (soft delete)
  const moveToTrash = async (index: number): Promise<boolean> => {
    // Use functional update to always get the latest state
    let updatedFiles: UploadedFile[] = [];
    setUploadedFiles(prev => {
      updatedFiles = [...prev];
      if (index >= 0 && index < updatedFiles.length) {
        updatedFiles[index] = {
          ...updatedFiles[index],
          trashed: true,
          trashedDate: Date.now(),
          modifiedDate: Date.now()
        };
      }
      return updatedFiles;
    });

    // Save in background - don't block on metadata save
    if (updatedFiles.length > 0) {
      saveUserFiles(updatedFiles).catch(err => {
        console.error('Failed to save file list metadata:', err);
      });
    }

    return true;
  };

  // Restore from trash
  const restoreFromTrash = async (index: number): Promise<boolean> => {
    const updatedFiles = [...uploadedFiles];
    updatedFiles[index] = {
      ...updatedFiles[index],
      trashed: false,
      trashedDate: undefined,
      modifiedDate: Date.now()
    };
    setUploadedFiles(updatedFiles);

    // Save in background - don't block on metadata save
    saveUserFiles(updatedFiles).catch(err => {
      console.error('Failed to save file list metadata:', err);
    });

    return true;
  };

  // Permanently delete
  const permanentlyDelete = async (index: number): Promise<boolean> => {
    // Get file from current state using functional update to ensure latest state
    let file: UploadedFile | undefined;
    let fileId: string | undefined;

    // Use functional update to get the latest state synchronously
    setUploadedFiles(prev => {
      if (index >= 0 && index < prev.length) {
        file = prev[index];
        fileId = file.id;
      }
      return prev; // Don't update yet, just get the file
    });

    // React executes the callback synchronously, so file should be set
    if (!file || !fileId) {
      console.error('File not found at index:', index);
      return false;
    }

    // Store fileId in a const to ensure it doesn't change
    const targetFileId = fileId;
    const targetFile = file;

    // Delete from backend database first
    try {
      const authToken = getAuthToken ? await getAuthToken() : null;
      if (authToken) {
        if (targetFile.isFolder) {
          await BackendFolderAPI.delete(targetFileId, authToken);
        } else {
          await BackendFileAPI.delete(targetFileId, authToken);
        }
      }
    } catch (error) {
      console.error('Failed to delete from backend:', error);
      // Continue with local deletion even if backend delete fails
    }

    // Unpin file before permanent deletion if it's pinned
    if (targetFile.isPinned && !targetFile.isFolder) {
      const pinningService = resolvePinningService(true);
      if (pinningService) {
        try {
          const authToken = getAuthToken ? await getAuthToken() : undefined;
          await pinningService.unpinFile(targetFile.ipfsUri, authToken || undefined);
        } catch (error) {
          console.error('Failed to unpin file during permanent delete:', error);
        }
      }
    }

    // Now remove the file using functional update (find by ID to avoid index issues)
    let updatedFiles: UploadedFile[] = [];
    setUploadedFiles(prev => {
      updatedFiles = prev.filter(f => f.id !== targetFileId);
      return updatedFiles;
    });

    // Save in background - don't block on metadata save
    if (updatedFiles.length > 0) {
      saveUserFiles(updatedFiles).catch(err => {
        console.error('Failed to save file list metadata:', err);
      });
    }

    return true;
  };

  // Auto-cleanup trash: unpin and delete files older than 30 days
  const autoCleanupTrash = async (): Promise<{ unpinned: number; deleted: number }> => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const trashedFiles = uploadedFiles.filter(f => f.trashed && f.trashedDate && f.trashedDate < thirtyDaysAgo);

    let unpinnedCount = 0;
    let deletedCount =  0;
    const updatedFiles = [...uploadedFiles];
    const pinningService = resolvePinningService(true);

    for (let i = updatedFiles.length - 1; i >= 0; i--) {
      const file = updatedFiles[i];
      if (!file.trashed || !file.trashedDate || file.trashedDate >= thirtyDaysAgo) continue;

      // Unpin if pinned (non-folders only)
      if (file.isPinned && !file.isFolder && pinningService) {
        try {
          const authToken = getAuthToken ? await getAuthToken() : undefined;
          await pinningService.unpinFile(file.ipfsUri, authToken || undefined);
          updatedFiles[i] = {
            ...file,
            isPinned: false,
            pinService: undefined,
            pinDate: undefined,
            pinExpiry: undefined,
            pinSize: undefined
          };
          unpinnedCount++;
        } catch (error) {
          console.error('Failed to unpin during auto-cleanup:', error);
        }
      }

      // Delete files older than 30 days
      updatedFiles.splice(i, 1);
      deletedCount++;
    }

    if (deletedCount > 0 || unpinnedCount > 0) {
      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
    }

    return { unpinned: unpinnedCount, deleted: deletedCount };
  };

  // Update last accessed time
  const updateLastAccessed = async (index: number) => {
    const file = uploadedFiles[index];
    if (!file) return;

    // Cache the file when accessed
    const fileCache = getFileCache();
    fileCache.set(file.id, file);

    const updatedFiles = [...uploadedFiles];
    updatedFiles[index] = {
      ...updatedFiles[index],
      lastAccessed: Date.now()
    };
    setUploadedFiles(updatedFiles);
    // Don't await - background update
    saveUserFiles(updatedFiles).catch(console.error);
  };

  return {
    moveToTrash,
    restoreFromTrash,
    permanentlyDelete,
    autoCleanupTrash,
    updateLastAccessed,
  };
};
