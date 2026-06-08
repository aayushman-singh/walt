/**
 * Version-history trigger state and the restore-version flow. Extracted verbatim
 * from pages/dashboard.tsx — same fetch URL and request body, same save path.
 */

import { useState } from 'react';
import { User } from 'firebase/auth';
import { ErrorHandler } from '../../../lib/errorHandler';
import { UploadedFile } from '../types';

interface UseVersionHistoryParams {
  user: User | null;
  uploadedFiles: UploadedFile[];
  renameItem: (index: number, newName: string) => Promise<boolean>;
  addFiles: (files: UploadedFile[], folderId: string | null) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
}

export function useVersionHistory({
  user,
  uploadedFiles,
  renameItem,
  addFiles,
  showToast,
}: UseVersionHistoryParams) {
  const [versionHistoryFile, setVersionHistoryFile] = useState<UploadedFile | null>(null);

  const handleShowVersionHistory = (file: UploadedFile) => {
    if (file.isFolder) return;
    setVersionHistoryFile(file);
  };

  const handleRestoreVersion = async (version: any) => {
    if (!versionHistoryFile || !user) return;

    try {
      const index = uploadedFiles.findIndex(f => f.id === versionHistoryFile.id);
      if (index === -1) {
        throw new Error('File not found');
      }

      const updatedFiles = [...uploadedFiles];
      updatedFiles[index] = {
        ...updatedFiles[index],
        ipfsUri: version.ipfsUri,
        gatewayUrl: version.gatewayUrl,
        modifiedDate: Date.now(),
        size: version.size,
      };

      const fileIndex = uploadedFiles.findIndex(f => f.id === versionHistoryFile.id);
      if (fileIndex !== -1) {
        await renameItem(fileIndex, versionHistoryFile.name); // This will trigger a save
        const currentFiles = uploadedFiles;
        currentFiles[fileIndex] = updatedFiles[index];
        await addFiles([currentFiles[fileIndex]], currentFiles[fileIndex].parentFolderId || null);
      }

      const token = await user.getIdToken();
      await fetch(`/api/versions/${versionHistoryFile.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: {
            ...version,
            versionId: undefined,
            version: undefined,
            changeDescription: `Restored from version ${version.version}`,
            timestamp: Date.now(),
            modifiedDate: Date.now(),
          },
        }),
      });

      showToast(`Restored to version ${version.version}`, 'success');
      setVersionHistoryFile(null);
    } catch (error: any) {
      const appError = ErrorHandler.createAppError(error);
      showToast(appError.userMessage, 'error');
    }
  };

  return {
    versionHistoryFile,
    setVersionHistoryFile,
    handleShowVersionHistory,
    handleRestoreVersion,
  };
}
