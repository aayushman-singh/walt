/**
 * File CRUD domain hook.
 *
 * Add / remove / clear / refresh / duplicate files, duplicate detection, and
 * version-history persistence on add. Receives shared file state, version state,
 * persistence, the loader (for refresh), the activity logger, and the error
 * setter from the parent composition hook.
 */

import {
  checkNewFileForDuplicates,
  getAllDuplicates,
  DuplicateMatch,
} from '../../lib/duplicateDetection';
import { createFileVersion, FileVersion } from '../../lib/versionHistory';
import { ErrorHandler, ErrorType, AppError } from '../../lib/errorHandler';
import { UploadedFile, ActivityLog } from './types';

interface UseFileCrudParams {
  userUid: string | null;
  getAuthToken?: () => Promise<string | null>;
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  saveUserFiles: (files: UploadedFile[]) => Promise<void>;
  loadUserFiles: () => Promise<void>;
  fileVersions: FileVersion[];
  setFileVersions: React.Dispatch<React.SetStateAction<FileVersion[]>>;
  currentFolderId: string | null;
  addActivityLog: (index: number, action: ActivityLog['action'], details?: string) => Promise<void>;
  setError: React.Dispatch<React.SetStateAction<AppError | null>>;
}

export const useFileCrud = ({
  userUid,
  getAuthToken,
  uploadedFiles,
  setUploadedFiles,
  saveUserFiles,
  loadUserFiles,
  fileVersions,
  setFileVersions,
  currentFolderId,
  addActivityLog,
  setError,
}: UseFileCrudParams) => {
  // Check for duplicates before adding files
  const checkDuplicates = (newFile: UploadedFile, parentFolderId: string | null = null): DuplicateMatch[] => {
    return checkNewFileForDuplicates(uploadedFiles, {
      name: newFile.name,
      size: newFile.size,
      type: newFile.type,
      ipfsUri: newFile.ipfsUri,
      parentFolderId: parentFolderId !== undefined ? parentFolderId : currentFolderId
    });
  };

  // Duplicate a file (copy with new ID and name)
  const duplicateFile = async (index: number): Promise<boolean> => {
    const file = uploadedFiles[index];
    if (!file || file.isFolder) return false;

    try {
      // Create a duplicate with new ID and name
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
      let newName = `${nameWithoutExt} (copy)${ext}`;

      // If copy already exists, increment number
      let counter = 1;
      while (uploadedFiles.some(f =>
        f.name === newName &&
        f.parentFolderId === file.parentFolderId &&
        !f.trashed &&
        !f.isFolder
      )) {
        counter++;
        newName = `${nameWithoutExt} (copy ${counter})${ext}`;
      }

      const duplicatedFile: UploadedFile = {
        ...file,
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: newName,
        timestamp: Date.now(),
        modifiedDate: Date.now(),
        starred: false, // Reset starred status for duplicate
        shareConfig: undefined, // Don't copy share config
        activityLog: [] // Start fresh activity log
      };

      const updatedFiles = [duplicatedFile, ...uploadedFiles];
      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      await addActivityLog(index, 'created', `Duplicated as "${newName}"`);

      return true;
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.FIRESTORE);
      ErrorHandler.logError(appError, 'duplicateFile');
      setError(appError);
      return false;
    }
  };

  // Get duplicates for a file
  const getFileDuplicates = (fileId: string): DuplicateMatch[] => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file || file.isFolder) return [];

    return getAllDuplicates(uploadedFiles, file);
  };

  // Save versions to Firestore
  const saveVersionsToFirestore = async (versions: FileVersion[]) => {
    if (!userUid) return;

    try {
      // Get auth token for API requests
      const authToken = getAuthToken ? await getAuthToken() : null;
      if (!authToken) {
        console.warn('No auth token available, skipping version save');
        return;
      }

      // Save each version via API
      for (const version of versions) {
        await fetch(`/api/versions/${version.fileId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ version }),
        }).catch(err => {
          console.error('Failed to save version:', err);
        });
      }
    } catch (error) {
      console.error('Error saving versions to Firestore:', error);
    }
  };

  // Add new files
  const addFiles = async (newFiles: UploadedFile[], parentFolderId: string | null = null) => {
    if (!userUid) return;

    // Ensure all files have IDs and correct parent
    const filesWithIds = newFiles.map(file => ({
      ...file,
      id: file.id || `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      parentFolderId: parentFolderId !== undefined ? parentFolderId : currentFolderId,
      modifiedDate: file.modifiedDate || Date.now()
    }));

    // Create version history entries for new/updated files
    const newVersions: FileVersion[] = [];
    for (const file of filesWithIds) {
      // Check if file with same ID already exists (update scenario)
      const existingFile = uploadedFiles.find(f => f.id === file.id);

      if (existingFile && existingFile.ipfsUri !== file.ipfsUri) {
        // This is an update - create a version from the old file
        const oldVersion = createFileVersion(
          existingFile.id,
          existingFile.ipfsUri,
          existingFile.gatewayUrl,
          userUid,
          {
            name: existingFile.name,
            type: existingFile.type,
            size: existingFile.size,
            modifiedDate: existingFile.modifiedDate,
          },
          fileVersions,
          'File updated'
        );
        newVersions.push(oldVersion);
      }

      // Create version for new/updated file
      const newVersion = createFileVersion(
        file.id,
        file.ipfsUri,
        file.gatewayUrl,
        userUid,
        {
          name: file.name,
          type: file.type,
          size: file.size,
          modifiedDate: file.modifiedDate,
        },
        fileVersions,
        existingFile ? 'File updated' : 'Initial upload'
      );
      newVersions.push(newVersion);
    }

    // Save versions to Firestore (async, don't block)
    if (newVersions.length > 0) {
      saveVersionsToFirestore(newVersions).catch(err => {
        console.error('Failed to save versions to Firestore:', err);
      });
      setFileVersions([...fileVersions, ...newVersions]);
    }

    // Update files list - merge with existing files or add new ones
    const finalFiles: UploadedFile[] = [];
    const processedIds = new Set<string>();

    // Add/update files from filesWithIds
    for (const newFile of filesWithIds) {
      const existingIndex = uploadedFiles.findIndex(f => f.id === newFile.id);
      if (existingIndex !== -1) {
        // Update existing file
        finalFiles.push(newFile);
      } else {
        // New file
        finalFiles.push(newFile);
      }
      processedIds.add(newFile.id);
    }

    // Add remaining existing files that weren't updated
    for (const existingFile of uploadedFiles) {
      if (!processedIds.has(existingFile.id)) {
        finalFiles.push(existingFile);
      }
    }

    // Update UI immediately so user sees the file
    setUploadedFiles(finalFiles);

    // Save file list to IPFS in background - don't block or throw errors
    // The file is already safely stored in the backend database
    saveUserFiles(finalFiles).catch(err => {
      console.error('Failed to save file list metadata to IPFS:', err);
      // Don't throw - the upload itself was successful
      // The file list will be updated on the next successful operation
    });
  };

  // Remove a file
  const removeFile = async (index: number) => {
    const updatedFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(updatedFiles);

    // Save in background - don't block on metadata save
    saveUserFiles(updatedFiles).catch(err => {
      console.error('Failed to save file list metadata:', err);
    });
  };

  // Clear all files
  const clearAllFiles = async () => {
    setUploadedFiles([]);

    // Save in background - don't block on metadata save
    saveUserFiles([]).catch(err => {
      console.error('Failed to save file list metadata:', err);
    });
  };

  return {
    addFiles,
    removeFile,
    clearAllFiles,
    refreshFiles: loadUserFiles,
    duplicateFile,
    checkDuplicates,
    getFileDuplicates,
  };
};
