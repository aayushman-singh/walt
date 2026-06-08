/**
 * Bulk operations + multi-select state for the dashboard: select/deselect,
 * bulk download/restore/move-to-trash/permanently-delete, and empty-trash, plus
 * the bulk-operation and permanent-delete progress queues with their auto-hide
 * effects. Extracted verbatim from pages/dashboard.tsx.
 */

import { useState, useRef, useEffect } from 'react';
import { UploadedFile, UploadProgress, ConfirmationModalState } from '../types';

interface UseBulkOperationsParams {
  uploadedFiles: UploadedFile[];
  uploadedFilesRef: React.MutableRefObject<UploadedFile[]>;
  filteredFiles: UploadedFile[];
  getTrashedItems: () => UploadedFile[];
  restoreFromTrash: (index: number) => Promise<boolean>;
  moveToTrash: (index: number) => Promise<boolean>;
  permanentlyDelete: (index: number) => Promise<boolean>;
  handleDownload: (file: UploadedFile) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
  setConfirmationModal: React.Dispatch<React.SetStateAction<ConfirmationModalState>>;
}

export function useBulkOperations({
  uploadedFiles,
  uploadedFilesRef,
  filteredFiles,
  getTrashedItems,
  restoreFromTrash,
  moveToTrash,
  permanentlyDelete,
  handleDownload,
  showToast,
  setConfirmationModal,
}: UseBulkOperationsParams) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [bulkOperationQueue, setBulkOperationQueue] = useState<UploadProgress[]>([]);
  const bulkOperationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [permanentDeleteQueue, setPermanentDeleteQueue] = useState<UploadProgress[]>([]);
  const permanentDeleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide bulk operation panel after completion
  useEffect(() => {
    if (bulkOperationQueue.length === 0) {
      return;
    }

    const allComplete = bulkOperationQueue.every(item => item.status === 'complete' || item.status === 'error');

    if (allComplete) {
      if (bulkOperationTimeoutRef.current) {
        clearTimeout(bulkOperationTimeoutRef.current);
      }
      bulkOperationTimeoutRef.current = setTimeout(() => {
        setBulkOperationQueue([]);
      }, 5000);
    } else {
      if (bulkOperationTimeoutRef.current) {
        clearTimeout(bulkOperationTimeoutRef.current);
        bulkOperationTimeoutRef.current = null;
      }
    }

    return () => {
      if (bulkOperationTimeoutRef.current) {
        clearTimeout(bulkOperationTimeoutRef.current);
      }
    };
  }, [bulkOperationQueue]);

  // Auto-hide permanent delete panel after completion
  useEffect(() => {
    if (permanentDeleteQueue.length === 0) {
      return;
    }

    const allComplete = permanentDeleteQueue.every(item => item.status === 'complete' || item.status === 'error');

    if (allComplete) {
      if (permanentDeleteTimeoutRef.current) {
        clearTimeout(permanentDeleteTimeoutRef.current);
      }
      permanentDeleteTimeoutRef.current = setTimeout(() => {
        setPermanentDeleteQueue([]);
        permanentDeleteTimeoutRef.current = null;
      }, 5000);
    } else {
      if (permanentDeleteTimeoutRef.current) {
        clearTimeout(permanentDeleteTimeoutRef.current);
        permanentDeleteTimeoutRef.current = null;
      }
    }

    return () => {
      if (permanentDeleteTimeoutRef.current) {
        clearTimeout(permanentDeleteTimeoutRef.current);
      }
    };
  }, [permanentDeleteQueue]);

  // Selection handlers
  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const selectAllFiles = () => {
    setSelectedFiles(new Set(filteredFiles.map(f => f.id)));
  };

  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
  };

  // Bulk download
  const handleBulkDownload = async () => {
    if (selectedFiles.size === 0) return;

    const filesToDownload = filteredFiles.filter(f => selectedFiles.has(f.id) && !f.isFolder);
    if (filesToDownload.length === 0) {
      showToast('Please select files to download', 'error');
      return;
    }

    // Temporary limitation: Only allow up to 2 files until ZIP feature is implemented
    if (filesToDownload.length > 2) {
      showToast('Download is currently limited to 2 files at a time. ZIP download feature coming soon!', 'info');
      return;
    }

    const downloadCount = filesToDownload.length;
    showToast(`Downloading ${downloadCount} file${downloadCount !== 1 ? 's' : ''}...`, 'info');

    try {
      let successCount = 0;
      let failCount = 0;

      for (const file of filesToDownload) {
        try {
          await handleDownload(file);
          successCount++;
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Failed to download ${file.name}:`, error);
          failCount++;
        }
      }

      if (failCount === 0) {
        showToast(`Downloaded ${successCount} file${successCount !== 1 ? 's' : ''}`, 'success');
      } else {
        showToast(`Downloaded ${successCount} file${successCount !== 1 ? 's' : ''}, ${failCount} failed`, 'error');
      }
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Bulk download error:', error);
      showToast('Some downloads failed', 'error');
      setSelectedFiles(new Set());
    }
  };

  // Bulk restore from trash
  const handleBulkRestore = async () => {
    if (selectedFiles.size === 0) return;

    const filesToRestore = filteredFiles.filter(f => selectedFiles.has(f.id) && !f.isFolder);
    if (filesToRestore.length === 0) {
      showToast('Please select files to restore', 'error');
      return;
    }

    try {
      let processed = 0;
      for (const file of filesToRestore) {
        const index = uploadedFiles.findIndex(f => f.id === file.id);
        if (index !== -1) {
          await restoreFromTrash(index);
          processed++;
        }
      }
      showToast(`Restored ${processed} file${processed !== 1 ? 's' : ''}`, 'success');
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Bulk restore error:', error);
      showToast('Failed to restore some files', 'error');
      setSelectedFiles(new Set());
    }
  };

  // Shared per-file permanent-delete loop used by both bulk-delete and
  // empty-trash. Each file is deleted by fresh index lookup + verify-by-ref,
  // retrying up to 15 times, with progress reported into permanentDeleteQueue.
  // Behaviour is identical to the two original copies.
  const runPermanentDelete = async (files: UploadedFile[]) => {
    const fileIdsToDelete = Array.from(new Set(files.map(f => f.id)));
    const fileMap = new Map(files.map(f => [f.id, f]));

    const initialQueue: UploadProgress[] = files.map(file => ({
      name: file.name,
      progress: 0,
      status: 'uploading' as const
    }));
    setPermanentDeleteQueue(initialQueue);

    let processed = 0;
    const totalFiles = fileIdsToDelete.length;

    const updateProgress = (fileId: string, progress: number, status: 'uploading' | 'complete' | 'error') => {
      const file = fileMap.get(fileId);
      if (file) {
        setPermanentDeleteQueue(prev => prev.map(item =>
          item.name === file.name
            ? { ...item, progress, status }
            : item
        ));
      }
    };

    for (const fileId of fileIdsToDelete) {
      try {
        let found = false;
        let attempts = 0;

        while (!found && attempts < 15) {
          const currentFiles = uploadedFilesRef.current;
          const currentIndex = currentFiles.findIndex(f => f.id === fileId);

          if (currentIndex !== -1) {
            await permanentlyDelete(currentIndex);

            await new Promise(resolve => setTimeout(resolve, 200));

            const verifyFiles = uploadedFilesRef.current;
            const fileStillExists = verifyFiles.find(f => f.id === fileId);

            if (!fileStillExists) {
              found = true;
            } else {
              await new Promise(resolve => setTimeout(resolve, 100));
              attempts++;
            }
          } else {
            found = true;
          }
        }

        if (found) {
          updateProgress(fileId, 100, 'complete');
          processed++;

          const progressPercent = Math.round((processed / totalFiles) * 100);
          setPermanentDeleteQueue(prev => prev.map(item =>
            item.status === 'uploading' && item.progress < progressPercent
              ? { ...item, progress: Math.min(progressPercent, 95) }
              : item
          ));
        } else {
          updateProgress(fileId, 0, 'error');
        }
      } catch (error) {
        console.error(`Failed to delete file ${fileId}:`, error);
        updateProgress(fileId, 0, 'error');
      }
    }

    setPermanentDeleteQueue(prev => prev.map(item =>
      item.status === 'uploading'
        ? { ...item, progress: 100, status: 'complete' as const }
        : item
    ));
  };

  // Bulk permanently delete
  const handleBulkPermanentlyDelete = async () => {
    if (selectedFiles.size === 0) return;

    const filesToDelete = filteredFiles.filter(f => selectedFiles.has(f.id) && !f.isFolder);
    if (filesToDelete.length === 0) {
      showToast('Please select files to delete', 'error');
      return;
    }

    setConfirmationModal({
      isOpen: true,
      title: 'Permanently Delete',
      message: `Permanently delete ${filesToDelete.length} file${filesToDelete.length !== 1 ? 's' : ''}?\n\nThis action cannot be undone!`,
      confirmText: 'Delete Forever',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));

        try {
          await runPermanentDelete(filesToDelete);
          setSelectedFiles(new Set());
        } catch (error) {
          console.error('Bulk permanently delete error:', error);
          showToast('Failed to delete some files', 'error');
        }
      },
      type: 'danger'
    });
  };

  // Empty trash - delete all files in trash
  const handleEmptyTrash = () => {
    const trashedFiles = getTrashedItems();
    if (trashedFiles.length === 0) {
      showToast('Trash is already empty', 'info');
      return;
    }

    setConfirmationModal({
      isOpen: true,
      title: 'Empty Trash',
      message: `Permanently delete all ${trashedFiles.length} item${trashedFiles.length !== 1 ? 's' : ''} in trash?\n\nThis action cannot be undone!`,
      confirmText: 'Empty Trash',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));

        try {
          await runPermanentDelete(trashedFiles);
        } catch (error) {
          console.error('Empty trash error:', error);
          showToast('Failed to empty trash', 'error');
        }
      },
      type: 'danger'
    });
  };

  // Bulk move to trash - process all files and folders by directly updating state
  const handleBulkMoveToTrash = async () => {
    if (selectedFiles.size === 0) return;

    const itemsToTrash = filteredFiles.filter(f => selectedFiles.has(f.id));
    if (itemsToTrash.length === 0) {
      showToast('Please select items to move to trash', 'error');
      return;
    }

    const itemIdsToTrash = new Set(itemsToTrash.map(f => f.id));
    const itemMap = new Map(itemsToTrash.map(f => [f.id, f]));

    const initialQueue: UploadProgress[] = itemsToTrash.map(item => ({
      name: item.name,
      progress: 0,
      status: 'uploading' as const
    }));
    setBulkOperationQueue(initialQueue);

    try {
      let processed = 0;
      const total = itemsToTrash.length;

      const updateProgress = (itemId: string, progress: number, status: 'uploading' | 'complete' | 'error') => {
        const item = itemMap.get(itemId);
        if (item) {
          setBulkOperationQueue(prev => prev.map(queueItem =>
            queueItem.name === item.name
              ? { ...queueItem, progress, status }
              : queueItem
          ));
        }
      };

      for (const itemId of Array.from(itemIdsToTrash)) {
        try {
          let found = false;
          let attempts = 0;

          while (!found && attempts < 15) {
            const currentFiles = uploadedFilesRef.current;
            const currentIndex = currentFiles.findIndex(f => f.id === itemId && !f.trashed);

            if (currentIndex !== -1) {
              await moveToTrash(currentIndex);

              await new Promise(resolve => setTimeout(resolve, 200));

              const verifyFiles = uploadedFilesRef.current;
              const itemState = verifyFiles.find(f => f.id === itemId);

              if (itemState?.trashed) {
                found = true;
              } else {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
              }
            } else {
              const itemState = currentFiles.find(f => f.id === itemId);
              if (itemState?.trashed) {
                found = true;
              } else {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
              }
            }
          }

          if (found) {
            updateProgress(itemId, 100, 'complete');
            processed++;

            const progressPercent = Math.round((processed / total) * 100);
            setBulkOperationQueue(prev => prev.map(queueItem =>
              queueItem.status === 'uploading' && queueItem.progress < progressPercent
                ? { ...queueItem, progress: Math.min(progressPercent, 95) }
                : queueItem
            ));
          } else {
            updateProgress(itemId, 0, 'error');
          }
        } catch (error) {
          console.error(`Failed to move item ${itemId} to trash:`, error);
          updateProgress(itemId, 0, 'error');
        }
      }

      setBulkOperationQueue(prev => prev.map(item =>
        item.status === 'uploading'
          ? { ...item, progress: 100, status: 'complete' as const }
          : item
      ));

      setTimeout(() => setBulkOperationQueue([]), 3000);
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Bulk move to trash error:', error);
      setBulkOperationQueue(prev => prev.map(item => ({
        ...item,
        status: 'error' as const
      })));
      setTimeout(() => setBulkOperationQueue([]), 3000);
      setSelectedFiles(new Set());
    }
  };

  return {
    selectedFiles,
    setSelectedFiles,
    bulkOperationQueue,
    setBulkOperationQueue,
    bulkOperationTimeoutRef,
    permanentDeleteQueue,
    setPermanentDeleteQueue,
    permanentDeleteTimeoutRef,
    toggleFileSelection,
    selectAllFiles,
    deselectAllFiles,
    handleBulkDownload,
    handleBulkRestore,
    handleBulkPermanentlyDelete,
    handleEmptyTrash,
    handleBulkMoveToTrash,
  };
}
