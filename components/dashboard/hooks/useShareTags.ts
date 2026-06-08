/**
 * Sharing and tagging handlers plus the share-modal and tag-manager trigger
 * state. Extracted verbatim from pages/dashboard.tsx.
 */

import { useState } from 'react';
import { ErrorHandler } from '../../../lib/errorHandler';
import { UploadedFile } from '../types';

interface UseShareTagsParams {
  uploadedFiles: UploadedFile[];
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
  enableSharing: (index: number, permission: 'viewer' | 'editor', expiryDate?: number, password?: string) => Promise<string | null>;
  disableSharing: (index: number) => Promise<boolean>;
  addTags: (index: number, tags: string[]) => Promise<boolean>;
  removeTags: (index: number, tags: string[]) => Promise<boolean>;
}

export function useShareTags({
  uploadedFiles,
  showToast,
  enableSharing,
  disableSharing,
  addTags,
  removeTags,
}: UseShareTagsParams) {
  const [shareModalFile, setShareModalFile] = useState<UploadedFile | null>(null);
  const [tagManagerFile, setTagManagerFile] = useState<UploadedFile | null>(null);

  const handleManageTags = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file) {
      setTagManagerFile(file);
    }
  };

  const handleAddTag = async (fileId: string, tag: string) => {
    const index = uploadedFiles.findIndex(f => f.id === fileId);
    if (index !== -1) {
      const success = await addTags(index, [tag]);
      if (success) {
        showToast(`Tag "${tag}" added`, 'success');
      } else {
        const appError = ErrorHandler.createAppError(new Error('Failed to add tag'));
        showToast(appError.userMessage, 'error');
      }
    }
  };

  const handleRemoveTag = async (fileId: string, tag: string) => {
    const index = uploadedFiles.findIndex(f => f.id === fileId);
    if (index !== -1) {
      const success = await removeTags(index, [tag]);
      if (success) {
        showToast(`Tag "${tag}" removed`, 'success');
      } else {
        const appError = ErrorHandler.createAppError(new Error('Failed to remove tag'));
        showToast(appError.userMessage, 'error');
      }
    }
  };

  const handleShare = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file) {
      setShareModalFile(file);
    }
  };

  const handleCreateShare = async (
    permission: 'viewer' | 'editor',
    expiryDate?: number,
    password?: string
  ): Promise<string | null> => {
    if (!shareModalFile) return null;

    const index = uploadedFiles.findIndex(f => f.id === shareModalFile.id);
    if (index === -1) return null;

    return await enableSharing(index, permission, expiryDate, password);
  };

  const handleDisableShare = async (): Promise<boolean> => {
    if (!shareModalFile) return false;

    const index = uploadedFiles.findIndex(f => f.id === shareModalFile.id);
    if (index === -1) return false;

    return await disableSharing(index);
  };

  return {
    shareModalFile,
    setShareModalFile,
    tagManagerFile,
    setTagManagerFile,
    handleManageTags,
    handleAddTag,
    handleRemoveTag,
    handleShare,
    handleCreateShare,
    handleDisableShare,
  };
}
