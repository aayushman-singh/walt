/**
 * Folders domain hook.
 *
 * Owns the current-folder navigation state plus folder/item structural
 * operations (create, rename, move, breadcrumb path). Receives shared file
 * state and persistence from the parent composition hook.
 */

import { useState } from 'react';
import { BackendFolderAPI } from '../../lib/backendClient';
import { UploadedFile } from './types';

interface UseFoldersParams {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  saveUserFiles: (files: UploadedFile[]) => Promise<void>;
  getAuthToken?: () => Promise<string | null>;
}

export const useFolders = ({
  uploadedFiles,
  setUploadedFiles,
  saveUserFiles,
  getAuthToken,
}: UseFoldersParams) => {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // null = root

  // Create a new folder
  const createFolder = async (folderName: string, parentId: string | null = null): Promise<boolean> => {
    try {
      let folderId: string;
      let folderTimestamp: number = Date.now();

      // First, create folder in backend database to ensure sync
      // This fixes issue where folders created in UI don't sync with backend database
      if (getAuthToken) {
        try {
          const authToken = await getAuthToken();
          if (authToken) {
            try {
              const backendFolder = await BackendFolderAPI.create(folderName, authToken, parentId || undefined);
              // Use backend-returned folder ID and timestamps
              folderId = backendFolder.id;
              folderTimestamp = new Date(backendFolder.created_at).getTime();
            } catch (backendError) {
              // If backend creation fails, log but continue with local creation
              // This ensures folder creation still works even if backend is temporarily unavailable
              console.warn('Backend folder creation failed (non-critical), using local ID:', backendError);
              folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
          } else {
            // No auth token - use local ID
            folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          }
        } catch (authError) {
          // Auth token fetch failed - use local ID
          console.warn('Auth token fetch failed for folder creation, using local ID:', authError);
          folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
      } else {
        // No getAuthToken function provided - use local ID
        folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      const newFolder: UploadedFile = {
        id: folderId,
        name: folderName,
        ipfsUri: '',
        gatewayUrl: '',
        timestamp: folderTimestamp,
        type: 'folder',
        isFolder: true,
        parentFolderId: parentId,
        isPinned: true, // Folders are always "pinned" (metadata only)
        modifiedDate: folderTimestamp
      };

      const updatedFiles = [newFolder, ...uploadedFiles];
      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      return true;
    } catch (error) {
      console.error('Create folder error:', error);
      return false;
    }
  };

  // Rename a file or folder
  const renameItem = async (index: number, newName: string): Promise<boolean> => {
    if (!newName.trim()) return false;

    const updatedFiles = [...uploadedFiles];
    updatedFiles[index] = {
      ...updatedFiles[index],
      name: newName,
      modifiedDate: Date.now()
    };
    setUploadedFiles(updatedFiles);

    // Save in background - don't block on metadata save
    saveUserFiles(updatedFiles).catch(err => {
      console.error('Failed to save file list metadata:', err);
    });

    return true;
  };

  // Move item to a different folder
  const moveItem = async (index: number, newParentId: string | null): Promise<boolean> => {
    const updatedFiles = [...uploadedFiles];
    updatedFiles[index] = {
      ...updatedFiles[index],
      parentFolderId: newParentId,
      modifiedDate: Date.now()
    };
    setUploadedFiles(updatedFiles);

    // Save in background - don't block on metadata save
    saveUserFiles(updatedFiles).catch(err => {
      console.error('Failed to save file list metadata:', err);
    });

    return true;
  };

  // Get folder breadcrumb path
  const getFolderPath = (folderId: string | null): UploadedFile[] => {
    if (!folderId) return [];

    const path: UploadedFile[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = uploadedFiles.find(f => f.id === currentId);
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parentFolderId || null;
    }

    return path;
  };

  return {
    currentFolderId,
    setCurrentFolderId,
    createFolder,
    renameItem,
    moveItem,
    getFolderPath,
  };
};
