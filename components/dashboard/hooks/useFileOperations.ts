/**
 * Single-item file/folder operations and the modal-trigger state they drive
 * (preview, details, hover preview, unpin-warning suppression). Extracted
 * verbatim from pages/dashboard.tsx — same toasts, same hook calls and args.
 */

import { useState, useRef } from 'react';
import { ErrorHandler } from '../../../lib/errorHandler';
import { getFileCache } from '../../../lib/fileCache';
import { ActivityLog } from '../../../hooks/useUserFileStorage';
import {
  UploadedFile,
  ConfirmationModalState,
  InputModalState,
  ActiveView,
} from '../types';

interface UseFileOperationsParams {
  uploadedFiles: UploadedFile[];
  currentFolderId: string | null;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  setCurrentFolderId: (id: string | null) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  isFileInputProcessingRef: React.MutableRefObject<boolean>;
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
  setConfirmationModal: React.Dispatch<React.SetStateAction<ConfirmationModalState>>;
  setInputModal: React.Dispatch<React.SetStateAction<InputModalState>>;
  checkBillingAccess: () => Promise<boolean>;
  // storage hook fns
  removeFile: (index: number) => Promise<void>;
  clearAllFiles: () => Promise<void>;
  pinFile: (index: number) => Promise<boolean>;
  unpinFile: (index: number) => Promise<boolean>;
  createFolder: (name: string, parentFolderId: string | null) => Promise<boolean>;
  renameItem: (index: number, newName: string) => Promise<boolean>;
  toggleStarred: (index: number) => Promise<boolean>;
  moveToTrash: (index: number) => Promise<boolean>;
  restoreFromTrash: (index: number) => Promise<boolean>;
  permanentlyDelete: (index: number) => Promise<boolean>;
  updateLastAccessed: (index: number) => Promise<void>;
  addActivityLog: (index: number, action: ActivityLog['action'], details?: string) => Promise<void>;
  duplicateFile: (index: number) => Promise<boolean>;
}

export function useFileOperations(params: UseFileOperationsParams) {
  const {
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
    checkBillingAccess,
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
  } = params;

  // Modal-trigger state owned by file operations
  const [previewModalFile, setPreviewModalFile] = useState<UploadedFile | null>(null);
  const [detailsPanelFile, setDetailsPanelFile] = useState<UploadedFile | null>(null);
  const [hoverPreviewFile, setHoverPreviewFile] = useState<UploadedFile | null>(null);
  const [hoverPreviewPosition, setHoverPreviewPosition] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [suppressUnpinWarnings, setSuppressUnpinWarnings] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('suppressUnpinWarnings') === 'true';
    }
    return false;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Link copied to clipboard!', 'success');
  };

  const deleteFile = async (index: number) => {
    const file = uploadedFiles[index];
    setConfirmationModal({
      isOpen: true,
      title: 'Remove File',
      message: 'Remove this file from your dashboard?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      onConfirm: async () => {
        await removeFile(index);
        showToast(`Removed "${file?.name || 'file'}"`, 'success');
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));
      },
      type: 'warning'
    });
  };

  const clearAll = async () => {
    setConfirmationModal({
      isOpen: true,
      title: 'Clear All Files',
      message: 'Clear all files from your dashboard?',
      confirmText: 'Clear All',
      cancelText: 'Cancel',
      onConfirm: async () => {
        await clearAllFiles();
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));
      },
      type: 'danger'
    });
  };

  const handlePinToggle = async (fileId: string, file: UploadedFile, event?: React.MouseEvent) => {
    // Check billing access before pinning
    if (!file.isPinned) {
      const hasAccess = await checkBillingAccess();
      if (!hasAccess) {
        showToast('Please add payment information to pin files', 'error');
        return;
      }
    }
    if (event) {
      event.stopPropagation();
    }

    const index = uploadedFiles.findIndex(f => f.id === fileId);
    if (file.isPinned) {
      // Check if warnings are suppressed
      if (suppressUnpinWarnings) {
        const success = await unpinFile(index);
        if (success) {
          showToast('Unpinned successfully', 'success');
        } else {
          showToast('Failed to unpin file', 'error');
        }
      } else {
        setConfirmationModal({
          isOpen: true,
          title: 'Unpin File',
          message: `🆓 Unpin "${file.name}"?\n\nUnpinned files are FREE but may be garbage collected from IPFS and become unavailable. Pinned files cost money but are guaranteed to persist.`,
          confirmText: 'Unpin (Free)',
          cancelText: 'Keep Pinned',
          onConfirm: async () => {
            const success = await unpinFile(index);
            if (success) {
              showToast('Unpinned successfully', 'success');
            } else {
              showToast('Failed to unpin file', 'error');
            }
            setConfirmationModal(prev => ({ ...prev, isOpen: false }));
          },
          type: 'warning',
          showSuppressOption: true,
          onSuppressChange: (suppress: boolean) => {
            setSuppressUnpinWarnings(suppress);
            if (typeof window !== 'undefined') {
              localStorage.setItem('suppressUnpinWarnings', suppress.toString());
            }
          }
        });
      }
    } else {
      const success = await pinFile(index);
      if (success) {
        showToast('File pinned successfully', 'success');
      } else {
        const appError = ErrorHandler.createAppError(new Error('Failed to pin file'));
        showToast(appError.userMessage, 'error');
      }
    }
  };

  const handleFileUploadClick = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (isFileInputProcessingRef.current) {
      return;
    }

    if (fileInputRef.current) {
      setTimeout(() => {
        if (fileInputRef.current && !isFileInputProcessingRef.current) {
          fileInputRef.current.click();
        }
      }, 0);
    }
  };

  const handleCreateFolder = async () => {
    setInputModal({
      isOpen: true,
      title: 'Create Folder',
      message: 'Enter folder name:',
      placeholder: 'Folder name',
      defaultValue: '',
      onConfirm: async (folderName) => {
        const success = await createFolder(folderName, currentFolderId);
        if (success) {
          showToast('Folder created successfully', 'success');
        } else {
          const appError = ErrorHandler.createAppError(new Error('Failed to create folder'));
          showToast(appError.userMessage, 'error');
        }
        setInputModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleFolderClick = (folder: UploadedFile) => {
    if (folder.isFolder) {
      setCurrentFolderId(folder.id);
      setActiveView('drive');
    }
  };

  const handleFileClick = (file: UploadedFile) => {
    if (file.isFolder) {
      handleFolderClick(file);
    } else {
      const index = uploadedFiles.findIndex(f => f.id === file.id);
      updateLastAccessed(index);
      window.open(file.gatewayUrl, '_blank');
    }
  };

  const handlePreview = (file: UploadedFile) => {
    if (file.isFolder) return;
    setPreviewModalFile(file);
    const index = uploadedFiles.findIndex(f => f.id === file.id);
    if (index !== -1) {
      updateLastAccessed(index);

      const fileCache = getFileCache();
      fileCache.set(file.id, file);
    }
  };

  const handleShowDetails = (file: UploadedFile) => {
    if (file.isFolder) return;
    setDetailsPanelFile(file);
  };

  const handleRename = async (fileId: string) => {
    const index = uploadedFiles.findIndex(f => f.id === fileId);
    if (index === -1) return;

    setInputModal({
      isOpen: true,
      title: 'Rename Item',
      message: 'Enter new name:',
      placeholder: 'New name',
      defaultValue: uploadedFiles[index].name,
      onConfirm: async (newName) => {
        if (newName === uploadedFiles[index].name) {
          setInputModal(prev => ({ ...prev, isOpen: false }));
          return;
        }

        const success = await renameItem(index, newName);
        if (success) {
          showToast('Renamed successfully', 'success');
        } else {
          const appError = ErrorHandler.createAppError(new Error('Failed to rename'));
          showToast(appError.userMessage, 'error');
        }
        setInputModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleToggleStar = async (fileId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }

    const index = uploadedFiles.findIndex(f => f.id === fileId);
    if (index === -1) return;

    const file = uploadedFiles[index];
    await toggleStarred(index);
    showToast(file.starred ? 'Removed from starred' : 'Added to starred', 'success');
  };

  const handleDelete = async (fileId: string) => {
    const index = uploadedFiles.findIndex(f => f.id === fileId);
    if (index === -1) return;

    const file = uploadedFiles[index];

    if (activeView === 'trash') {
      setConfirmationModal({
        isOpen: true,
        title: 'Permanently Delete',
        message: `Permanently delete "${file.name}"?\n\nThis action cannot be undone!`,
        confirmText: 'Delete Forever',
        cancelText: 'Cancel',
        onConfirm: async () => {
          await permanentlyDelete(index);
          showToast(`Permanently deleted "${file.name}"`, 'success');
          setConfirmationModal(prev => ({ ...prev, isOpen: false }));
        },
        type: 'danger'
      });
    } else {
      setConfirmationModal({
        isOpen: true,
        title: 'Move to Trash',
        message: `Move "${file.name}" to trash?`,
        confirmText: 'Move to Trash',
        cancelText: 'Cancel',
        onConfirm: async () => {
          await moveToTrash(index);
          showToast(`Moved "${file.name}" to trash`, 'success');
          setConfirmationModal(prev => ({ ...prev, isOpen: false }));
        },
        type: 'warning'
      });
    }
  };

  const handleRestore = async (fileId: string) => {
    const index = uploadedFiles.findIndex(f => f.id === fileId);
    if (index === -1) return;

    const success = await restoreFromTrash(index);
    if (success) {
      showToast('Restored successfully', 'success');
    }
  };

  const handleDownload = async (file: UploadedFile) => {
    try {
      const fileCache = getFileCache();

      const cached = fileCache.get(file.id);
      let blob: Blob;

      if (cached?.content instanceof Blob) {
        blob = cached.content;
      } else {
        const response = await fetch(file.gatewayUrl);
        blob = await response.blob();

        fileCache.set(file.id, file, blob);
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const index = uploadedFiles.findIndex(f => f.id === file.id);
      if (index !== -1) {
        await addActivityLog(index, 'downloaded');
      }
    } catch (error) {
      const appError = ErrorHandler.createAppError(error);
      ErrorHandler.logError(appError, 'handleDownload');
      showToast(appError.userMessage || 'Download failed. Please try opening the file instead.', 'error');
    }
  };

  const handleDuplicate = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file || file.isFolder) return;

    const index = uploadedFiles.findIndex(f => f.id === fileId);
    const success = await duplicateFile(index);
    if (success) {
      showToast(`File duplicated: "${file.name}"`, 'success');
    } else {
      const appError = ErrorHandler.createAppError(new Error('Failed to duplicate file'));
      showToast(appError.userMessage, 'error');
    }
  };

  const handleViewChange = (view: ActiveView) => {
    setActiveView(view);
    if (view === 'drive') {
      // Stay in current folder
    } else {
      // Other views ignore folder navigation
    }
  };

  return {
    // modal state
    previewModalFile,
    setPreviewModalFile,
    detailsPanelFile,
    setDetailsPanelFile,
    hoverPreviewFile,
    setHoverPreviewFile,
    hoverPreviewPosition,
    setHoverPreviewPosition,
    hoverTimeoutRef,
    suppressUnpinWarnings,
    setSuppressUnpinWarnings,
    // handlers
    copyToClipboard,
    deleteFile,
    clearAll,
    handlePinToggle,
    handleFileUploadClick,
    handleCreateFolder,
    handleFolderClick,
    handleFileClick,
    handlePreview,
    handleShowDetails,
    handleRename,
    handleToggleStar,
    handleDelete,
    handleRestore,
    handleDownload,
    handleDuplicate,
    handleViewChange,
  };
}
