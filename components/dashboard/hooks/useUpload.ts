/**
 * Upload orchestration: dropzone wiring, large-file confirmation, duplicate
 * resolution (one-at-a-time modal with Yes/No-to-all), and the actual backend
 * upload + progress simulation. Extracted verbatim from pages/dashboard.tsx.
 *
 * The original had two near-identical functions, performUpload (current folder,
 * with billing gate) and performUploadToFolder (explicit folder, no billing
 * gate). They are unified here into performUploadCore parameterised by the
 * target folder and a flag for the billing check — behaviour is byte-identical
 * to the originals, including the exact duplicate-resolution branches.
 */

import { useState, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { calculatePinningCost, DEFAULT_BILLING_CYCLE_DAYS } from '../../../lib/pinningService';
import { getOptimizedGatewayUrl } from '../../../lib/gatewayOptimizer';
import { BackendFileAPI } from '../../../lib/backendClient';
import { ErrorHandler } from '../../../lib/errorHandler';
import { getFriendlyPinServiceLabel, formatFileSize, billingCycleTitle } from '../utils';
import {
  UploadedFile,
  UploadProgress,
  ConfirmationModalState,
  DuplicateFileModalState,
} from '../types';

interface UseUploadParams {
  user: User | null;
  uploadedFiles: UploadedFile[];
  uploadedFilesRef: React.MutableRefObject<UploadedFile[]>;
  currentFolderId: string | null;
  autoPinEnabled: boolean;
  addFiles: (files: UploadedFile[], folderId: string | null) => Promise<void>;
  removeFile: (index: number) => Promise<void>;
  moveItem: (index: number, targetFolderId: string | null) => Promise<boolean>;
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
  setConfirmationModal: React.Dispatch<React.SetStateAction<ConfirmationModalState>>;
  confirmationModal: ConfirmationModalState;
  setDuplicateFileModal: React.Dispatch<React.SetStateAction<DuplicateFileModalState>>;
  checkBillingAccess: () => Promise<boolean>;
  setIsDragging: (dragging: boolean) => void;
}

const CLOSED_DUPLICATE_MODAL: DuplicateFileModalState = {
  isOpen: false,
  fileName: '',
  newFile: null,
  existingFileIndex: null,
  onResolve: () => {},
  hasMultipleDuplicates: false,
  remainingCount: 0,
};

export function useUpload({
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
  checkBillingAccess,
  setIsDragging,
}: UseUploadParams) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadProgress[]>([]);
  const uploadCompleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide upload panel after completion
  useEffect(() => {
    if (uploadQueue.length === 0) {
      return;
    }

    const allComplete = uploadQueue.every(item => item.status === 'complete' || item.status === 'error');

    if (allComplete) {
      // Clear any existing timeout
      if (uploadCompleteTimeoutRef.current) {
        clearTimeout(uploadCompleteTimeoutRef.current);
      }

      // Auto-hide after 5 seconds
      uploadCompleteTimeoutRef.current = setTimeout(() => {
        setUploadQueue([]);
      }, 5000);
    } else {
      // Clear timeout if uploads are still in progress
      if (uploadCompleteTimeoutRef.current) {
        clearTimeout(uploadCompleteTimeoutRef.current);
        uploadCompleteTimeoutRef.current = null;
      }
    }

    return () => {
      if (uploadCompleteTimeoutRef.current) {
        clearTimeout(uploadCompleteTimeoutRef.current);
      }
    };
  }, [uploadQueue]);

  // Resolve duplicates one-at-a-time, mutating filesToUpload. Identical for both
  // upload entry points; the only difference is the target folder used for the
  // "keep both" rename collision check.
  // skipOnNoToAll mirrors the originals exactly: performUpload (current folder)
  // had an explicit `if (applyToAll && !batchAction) continue;` skip branch;
  // performUploadToFolder did NOT. Preserved as-is rather than "fixed".
  const resolveDuplicates = async (
    filesToProcess: { file: File; duplicateFileId: string; duplicateFile: UploadedFile }[],
    filesToUpload: File[],
    targetFolderId: string | null,
    skipOnNoToAll: boolean,
  ) => {
    let batchAction: 'replace' | 'keepBoth' | null = null;
    let applyToAll = false;

    for (let i = 0; i < filesToProcess.length; i++) {
      const { file, duplicateFileId } = filesToProcess[i];
      const remainingCount = filesToProcess.length - i - 1;
      const hasMultiple = filesToProcess.length > 1;

      // If "Yes to All" was selected, apply the batch action to all remaining files
      if (applyToAll && batchAction) {
        if (batchAction === 'replace') {
          const currentFiles = uploadedFilesRef.current;
          const fileIndex = currentFiles.findIndex(f => f.id === duplicateFileId);
          if (fileIndex !== -1) {
            await removeFile(fileIndex);
          }
          filesToUpload.push(file);
        } else {
          const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
          const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
          let newName = `${nameWithoutExt} (1)${ext}`;
          let counter = 1;
          const currentFiles = uploadedFilesRef.current;
          while (currentFiles.some(f => !f.isFolder && !f.trashed && f.name === newName && f.parentFolderId === targetFolderId)) {
            counter++;
            newName = `${nameWithoutExt} (${counter})${ext}`;
          }
          const renamedFile = new File([file], newName, { type: file.type });
          filesToUpload.push(renamedFile);
        }
        continue;
      }

      // If "No to All" was selected, skip all remaining files
      if (skipOnNoToAll && applyToAll && !batchAction) {
        continue;
      }

      await new Promise<void>((resolve) => {
        let resolved = false;
        const handleResolve = async (action: 'replace' | 'keepBoth' | 'cancel') => {
          if (resolved) return;
          resolved = true;

          try {
            if (action === 'cancel') {
              setDuplicateFileModal(CLOSED_DUPLICATE_MODAL);
              resolve();
              return;
            }

            if (action === 'replace') {
              const currentFiles = uploadedFilesRef.current;
              const fileIndex = currentFiles.findIndex(f => f.id === duplicateFileId);
              if (fileIndex !== -1) {
                await removeFile(fileIndex);
              }
              filesToUpload.push(file);
            } else {
              const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
              const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
              let newName = `${nameWithoutExt} (1)${ext}`;
              let counter = 1;
              const currentFiles = uploadedFilesRef.current;
              while (currentFiles.some(f => !f.isFolder && !f.trashed && f.name === newName && f.parentFolderId === targetFolderId)) {
                counter++;
                newName = `${nameWithoutExt} (${counter})${ext}`;
              }
              const renamedFile = new File([file], newName, { type: file.type });
              filesToUpload.push(renamedFile);
            }
          } finally {
            setDuplicateFileModal(CLOSED_DUPLICATE_MODAL);
            resolve();
          }
        };

        const handleYesToAll = (action: 'replace' | 'keepBoth') => {
          if (resolved) return;
          resolved = true;
          batchAction = action; // Use the selected option
          applyToAll = true;
          // Apply to current file with the selected action
          handleResolve(action).then(() => {
            setDuplicateFileModal(CLOSED_DUPLICATE_MODAL);
            resolve();
          });
        };

        const handleNoToAll = () => {
          if (resolved) return;
          resolved = true;
          applyToAll = true;
          batchAction = null; // Skip all
          setDuplicateFileModal(CLOSED_DUPLICATE_MODAL);
          resolve();
        };

        setDuplicateFileModal({
          isOpen: true,
          fileName: file.name,
          newFile: null,
          existingFileIndex: uploadedFiles.findIndex(f => f.id === duplicateFileId),
          onResolve: handleResolve,
          hasMultipleDuplicates: hasMultiple,
          remainingCount: remainingCount,
          onYesToAll: hasMultiple ? handleYesToAll : undefined,
          onNoToAll: hasMultiple ? handleNoToAll : undefined
        });
      });
    }
  };

  const performUploadCore = async (
    acceptedFiles: File[],
    targetFolderId: string | null,
    skipOnNoToAll: boolean,
  ) => {
    if (!user) {
      showToast('Please sign in to upload files', 'error');
      return;
    }

    // Check for duplicates BEFORE uploading
    const filesToUpload: File[] = [];
    const filesToProcess: { file: File; duplicateFileId: string; duplicateFile: UploadedFile }[] = [];

    for (const file of acceptedFiles) {
      // Check for duplicates by name in the same folder (primary check)
      const existingFile = uploadedFiles.find(f =>
        !f.isFolder &&
        !f.trashed &&
        f.parentFolderId === targetFolderId &&
        f.name.toLowerCase() === file.name.toLowerCase()
      );

      if (existingFile) {
        filesToProcess.push({ file, duplicateFileId: existingFile.id, duplicateFile: existingFile });
      } else {
        filesToUpload.push(file);
      }
    }

    await resolveDuplicates(filesToProcess, filesToUpload, targetFolderId, skipOnNoToAll);

    // If no files to upload after processing duplicates, return
    if (filesToUpload.length === 0) {
      setIsUploading(false);
      return;
    }

    setIsUploading(true);

    // Initialize upload queue only for files that will be uploaded
    const initialQueue: UploadProgress[] = filesToUpload.map(file => ({
      name: file.name,
      progress: 0,
      status: 'uploading' as const
    }));
    setUploadQueue(initialQueue);

    try {
      // Get Firebase ID token
      const token = await user.getIdToken();

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadQueue(prev => prev.map(item =>
          item.status === 'uploading' && item.progress < 90
            ? { ...item, progress: Math.min(item.progress + Math.random() * 15, 90) }
            : item
        ));
      }, 300);

      // Upload files to backend
      const uploadPromises = filesToUpload.map(file =>
        BackendFileAPI.upload(file, token, {
          parentFolderId: targetFolderId || undefined,
          isPinned: autoPinEnabled
        })
      );
      const uploadResults = await Promise.all(uploadPromises);
      clearInterval(progressInterval);

      // Mark all as complete
      setUploadQueue(prev => prev.map(item => ({
        ...item,
        progress: 100,
        status: 'complete' as const
      })));

      // Create uploaded file objects from backend response
      const pinServiceLabel = getFriendlyPinServiceLabel();
      const newFiles: UploadedFile[] = uploadResults.map((result) => ({
        id: result.id,
        name: result.filename,
        ipfsUri: `ipfs://${result.cid}`,
        gatewayUrl: getOptimizedGatewayUrl(`ipfs://${result.cid}`),
        timestamp: Date.now(),
        type: result.mimeType || 'unknown',
        size: result.size,
        isPinned: result.isPinned || autoPinEnabled,
        pinService: (result.isPinned || autoPinEnabled) ? pinServiceLabel : undefined,
        pinDate: (result.isPinned || autoPinEnabled) ? Date.now() : undefined,
        parentFolderId: targetFolderId,
        modifiedDate: Date.now()
      }));

      // Add all files (duplicates already handled)
      await addFiles(newFiles, targetFolderId);

      // Clear queue after 2 seconds
      setTimeout(() => setUploadQueue([]), 2000);
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadQueue(prev => prev.map(item => ({
        ...item,
        status: 'error' as const
      })));
      showToast('Upload failed. Please try again.', 'error');
      setTimeout(() => setUploadQueue([]), 3000);
    } finally {
      setIsUploading(false);
    }
  };

  const performUpload = async (acceptedFiles: File[]) => {
    if (!user) {
      showToast('Please sign in to upload files', 'error');
      return;
    }

    // Check billing access before upload
    const hasAccess = await checkBillingAccess();
    if (!hasAccess) {
      showToast('Please add payment information to continue', 'error');
      return;
    }

    await performUploadCore(acceptedFiles, currentFolderId, true);
  };

  const performUploadToFolder = async (acceptedFiles: File[], folderId: string) => {
    await performUploadCore(acceptedFiles, folderId, false);
  };

  const buildLargeFileWarning = (
    acceptedFiles: File[],
    onContinue: () => Promise<void>,
  ): boolean => {
    const largeFiles = acceptedFiles.filter(f => f.size > 100 * 1024 * 1024);
    if (largeFiles.length === 0) return false;

    const totalSize = largeFiles.reduce((sum, f) => sum + f.size, 0);
    const costEstimate = calculatePinningCost(totalSize, DEFAULT_BILLING_CYCLE_DAYS);
    const fileNames = largeFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ');
    setConfirmationModal({
      isOpen: true,
      title: 'Large Files Detected',
      message: `Large files detected:\n${fileNames}\n\nTotal size: ${formatFileSize(totalSize)}\nEstimated pinning cost (${billingCycleTitle}): ${costEstimate}\n\nLarge files may take longer to upload and cost more to pin. Continue?`,
      confirmText: 'Continue',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));
        await onContinue();
      },
      type: 'warning'
    });
    return true;
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const showedWarning = buildLargeFileWarning(acceptedFiles, () => performUpload(acceptedFiles));
    if (showedWarning) return;
    await performUpload(acceptedFiles);
  };

  const handleFolderDrop = async (folderId: string, acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const showedWarning = buildLargeFileWarning(acceptedFiles, () => performUploadToFolder(acceptedFiles, folderId));
    if (showedWarning) return;
    await performUploadToFolder(acceptedFiles, folderId);
  };

  const handleFileMove = async (fileId: string, targetFolderId: string | null) => {
    const fileIndex = uploadedFiles.findIndex(f => f.id === fileId);
    if (fileIndex === -1) {
      setIsDragging(false);
      return;
    }

    const success = await moveItem(fileIndex, targetFolderId);
    if (success) {
      showToast(`File moved to ${targetFolderId ? 'folder' : 'root'}`, 'success');
    } else {
      const appError = ErrorHandler.createAppError(new Error('Failed to move file'));
      showToast(appError.userMessage, 'error');
    }

    // Reset dragging state after move
    setIsDragging(false);
  };

  return {
    isUploading,
    setIsUploading,
    uploadQueue,
    setUploadQueue,
    uploadCompleteTimeoutRef,
    onDrop,
    handleFolderDrop,
    handleFileMove,
    performUpload,
    performUploadToFolder,
  };
}
