import React, { useState, useEffect } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useStorageUpload } from '@thirdweb-dev/react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../contexts/AuthContext';
import { useUserFileStorage } from '../hooks/useUserFileStorage';
import ShareModal from '../components/ShareModal';
import Toast from '../components/Toast';
import ConfirmationModal from '../components/ConfirmationModal';
import InputModal from '../components/InputModal';
import styles from '../styles/Dashboard.module.css';

interface ShareConfig {
  shareId: string;
  enabled: boolean;
  createdDate: number;
  createdBy: string;
  permission: 'viewer' | 'editor';
  expiryDate?: number;
  password?: string;
  accessCount?: number;
  lastAccessedDate?: number;
}

interface UploadedFile {
  id: string;
  name: string;
  ipfsUri: string;
  gatewayUrl: string;
  timestamp: number;
  type: string;
  size?: number;
  // Pinning metadata
  isPinned?: boolean;
  pinService?: string;
  pinDate?: number;
  pinExpiry?: number;
  pinSize?: number;
  autoPinEnabled?: boolean;
  // Folder/organization metadata
  parentFolderId?: string | null;
  isFolder?: boolean;
  starred?: boolean;
  trashed?: boolean;
  trashedDate?: number;
  lastAccessed?: number;
  modifiedDate?: number;
  // Sharing metadata (Phase 3)
  shareConfig?: ShareConfig;
}

interface UploadProgress {
  name: string;
  progress: number;
  status: 'uploading' | 'complete' | 'error';
}

const Dashboard: NextPage = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadProgress[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<'drive' | 'recent' | 'starred' | 'trash'>('drive');
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [shareModalFile, setShareModalFile] = useState<UploadedFile | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    fileType: 'all' as 'all' | 'image' | 'video' | 'audio' | 'document' | 'folder' | 'other',
    pinStatus: 'all' as 'all' | 'pinned' | 'unpinned',
    starStatus: 'all' as 'all' | 'starred' | 'unstarred',
    sizeMin: '' as string,
    sizeMax: '' as string,
    dateFrom: '' as string,
    dateTo: '' as string,
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    type?: 'warning' | 'danger' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [inputModal, setInputModal] = useState<{
    isOpen: boolean;
    title: string;
    message?: string;
    placeholder?: string;
    defaultValue?: string;
    onConfirm: (value: string) => void;
  }>({
    isOpen: false,
    title: '',
    onConfirm: () => {}
  });
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { mutateAsync: upload } = useStorageUpload();

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };
  
  // Use the new IPFS-based storage hook
  const { 
    uploadedFiles, 
    loading: filesLoading, 
    addFiles, 
    removeFile, 
    clearAllFiles,
    pinFile,
    unpinFile,
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
    addActivityLog
  } = useUserFileStorage(user?.uid || null);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Handle URL navigation for folders
  useEffect(() => {
    if (!router.isReady || !user) return;

    const { folder } = router.query;
    
    if (folder === 'root' || folder === undefined) {
      setCurrentFolderId(null);
    } else if (typeof folder === 'string') {
      // Check if this folder exists in our files
      const folderExists = uploadedFiles.some(f => f.id === folder && f.isFolder);
      if (folderExists) {
        setCurrentFolderId(folder);
      } else {
        // Invalid folder ID, redirect to root
        router.replace('/dashboard?folder=root');
      }
    }
  }, [router.isReady, router.query.folder, uploadedFiles, user, setCurrentFolderId, router]);

  // Update URL when folder changes
  useEffect(() => {
    if (!router.isReady) return;

    const currentFolder = router.query.folder;
    const newFolder = currentFolderId || 'root';
    
    if (currentFolder !== newFolder) {
      router.replace(`/dashboard?folder=${newFolder}`, undefined, { shallow: true });
    }
  }, [currentFolderId, router]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuId && !(event.target as Element).closest('.imageMenu')) {
        setOpenMenuId(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  // Safety mechanism: reset dragging state if drag seems stuck
  useEffect(() => {
    if (isDragging) {
      const timeout = setTimeout(() => {
        console.log('=== DRAG TIMEOUT - RESETTING STATE ===');
        setIsDragging(false);
      }, 5000); // Reset after 5 seconds if still dragging
      
      return () => clearTimeout(timeout);
    }
  }, [isDragging]);

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Large file warning (> 100MB)
    const largeFiles = acceptedFiles.filter(f => f.size > 100 * 1024 * 1024);
    if (largeFiles.length > 0) {
      const fileNames = largeFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ');
      setConfirmationModal({
        isOpen: true,
        title: 'Large Files Detected',
        message: `Large files detected:\n${fileNames}\n\nLarge files may take longer to upload and cost more to pin. Continue?`,
        confirmText: 'Continue',
        cancelText: 'Cancel',
        onConfirm: async () => {
          setConfirmationModal({ ...confirmationModal, isOpen: false });
          await performUpload(acceptedFiles);
        },
        type: 'warning'
      });
      return;
    }
    
    await performUpload(acceptedFiles);
  };

  const handleFolderDrop = async (folderId: string, acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Large file warning (> 100MB)
    const largeFiles = acceptedFiles.filter(f => f.size > 100 * 1024 * 1024);
    if (largeFiles.length > 0) {
      const fileNames = largeFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ');
      setConfirmationModal({
        isOpen: true,
        title: 'Large Files Detected',
        message: `Large files detected:\n${fileNames}\n\nLarge files may take longer to upload and cost more to pin. Continue?`,
        confirmText: 'Continue',
        cancelText: 'Cancel',
        onConfirm: async () => {
          setConfirmationModal({ ...confirmationModal, isOpen: false });
          await performUploadToFolder(acceptedFiles, folderId);
        },
        type: 'warning'
      });
      return;
    }
    
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
      showToast('Failed to move file', 'error');
    }
    
    // Reset dragging state after move
    setIsDragging(false);
  };

  const performUploadToFolder = async (acceptedFiles: File[], folderId: string) => {
    setIsUploading(true);
    
    // Initialize upload queue
    const initialQueue: UploadProgress[] = acceptedFiles.map(file => ({
      name: file.name,
      progress: 0,
      status: 'uploading' as const
    }));
    setUploadQueue(initialQueue);
    
    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadQueue(prev => prev.map(item => 
          item.status === 'uploading' && item.progress < 90
            ? { ...item, progress: Math.min(item.progress + Math.random() * 15, 90) }
            : item
        ));
      }, 300);
      
      const uris = await upload({ data: acceptedFiles });
      clearInterval(progressInterval);
      
      console.log('Upload successful:', uris);

      // Mark all as complete
      setUploadQueue(prev => prev.map(item => ({
        ...item,
        progress: 100,
        status: 'complete' as const
      })));

      const newFiles: UploadedFile[] = acceptedFiles.map((file, index) => ({
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        ipfsUri: uris[index],
        gatewayUrl: uris[index].replace('ipfs://', 'https://ipfs.io/ipfs/'),
        timestamp: Date.now(),
        type: file.type || 'unknown',
        size: file.size,
        isPinned: autoPinEnabled,
        pinService: autoPinEnabled ? 'local' : undefined,
        pinDate: autoPinEnabled ? Date.now() : undefined,
        parentFolderId: folderId,
        modifiedDate: Date.now()
      }));

      await addFiles(newFiles, folderId);
      
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
    setIsUploading(true);
    
    // Initialize upload queue
    const initialQueue: UploadProgress[] = acceptedFiles.map(file => ({
      name: file.name,
      progress: 0,
      status: 'uploading' as const
    }));
    setUploadQueue(initialQueue);
    
    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadQueue(prev => prev.map(item => 
          item.status === 'uploading' && item.progress < 90
            ? { ...item, progress: Math.min(item.progress + Math.random() * 15, 90) }
            : item
        ));
      }, 300);
      
      const uris = await upload({ data: acceptedFiles });
      clearInterval(progressInterval);
      
      console.log('Upload successful:', uris);

      // Mark all as complete
      setUploadQueue(prev => prev.map(item => ({
        ...item,
        progress: 100,
        status: 'complete' as const
      })));

      const newFiles: UploadedFile[] = acceptedFiles.map((file, index) => ({
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        ipfsUri: uris[index],
        gatewayUrl: uris[index].replace('ipfs://', 'https://ipfs.io/ipfs/'),
        timestamp: Date.now(),
        type: file.type || 'unknown',
        size: file.size,
        isPinned: autoPinEnabled,
        pinService: autoPinEnabled ? 'local' : undefined,
        pinDate: autoPinEnabled ? Date.now() : undefined,
        parentFolderId: currentFolderId,
        modifiedDate: Date.now()
      }));

      await addFiles(newFiles, currentFolderId);
      
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    multiple: true,
    noClick: false
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Link copied to clipboard!', 'success');
  };

  const deleteFile = async (index: number) => {
    setConfirmationModal({
      isOpen: true,
      title: 'Remove File',
      message: 'Remove this file from your dashboard?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      onConfirm: async () => {
        await removeFile(index);
        setConfirmationModal({ ...confirmationModal, isOpen: false });
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
        setConfirmationModal({ ...confirmationModal, isOpen: false });
      },
      type: 'danger'
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📕';
    if (type.includes('word') || type.includes('document')) return '📄';
    if (type.includes('sheet') || type.includes('excel')) return '📊';
    if (type.includes('zip') || type.includes('rar')) return '🗜️';
    return '📄';
  };

  // Get files based on active view
  const getViewFiles = () => {
    // If searching, return all files (not limited to current folder)
    if (searchTerm) {
      return uploadedFiles.filter(f => !f.trashed);
    }
    
    switch (activeView) {
      case 'recent':
        return getRecentFiles();
      case 'starred':
        return getStarredItems();
      case 'trash':
        return getTrashedItems();
      case 'drive':
      default:
        return getCurrentFolderItems();
    }
  };

  const displayFiles = getViewFiles();
  
  // Apply search and filters
  const filteredFiles = displayFiles.filter(file => {
    // Text search
    if (searchTerm && !file.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    // File type filter
    if (filters.fileType !== 'all') {
      if (filters.fileType === 'folder' && !file.isFolder) return false;
      if (filters.fileType === 'image' && !file.type.startsWith('image/')) return false;
      if (filters.fileType === 'video' && !file.type.startsWith('video/')) return false;
      if (filters.fileType === 'audio' && !file.type.startsWith('audio/')) return false;
      if (filters.fileType === 'document' && !file.type.includes('pdf') && !file.type.includes('document') && !file.type.includes('text')) return false;
      if (filters.fileType === 'other' && (file.isFolder || file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/'))) return false;
    }
    
    // Pin status filter
    if (!file.isFolder && filters.pinStatus !== 'all') {
      if (filters.pinStatus === 'pinned' && !file.isPinned) return false;
      if (filters.pinStatus === 'unpinned' && file.isPinned) return false;
    }
    
    // Star status filter
    if (filters.starStatus !== 'all') {
      if (filters.starStatus === 'starred' && !file.starred) return false;
      if (filters.starStatus === 'unstarred' && file.starred) return false;
    }
    
    // Size filter (in MB)
    if (!file.isFolder && file.size) {
      const sizeInMB = file.size / (1024 * 1024);
      if (filters.sizeMin && sizeInMB < parseFloat(filters.sizeMin)) return false;
      if (filters.sizeMax && sizeInMB > parseFloat(filters.sizeMax)) return false;
    }
    
    // Date filter
    const fileDate = file.modifiedDate || file.timestamp;
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom).getTime();
      if (fileDate < fromDate) return false;
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo).getTime() + (24 * 60 * 60 * 1000); // End of day
      if (fileDate > toDate) return false;
    }
    
    return true;
  });

  const handlePinToggle = async (fileId: string, file: UploadedFile, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    
    const index = uploadedFiles.findIndex(f => f.id === fileId);
    if (file.isPinned) {
      setConfirmationModal({
        isOpen: true,
        title: 'Unpin File',
        message: `⚠️ Unpin "${file.name}"?\n\nUnpinned files may be garbage collected from IPFS and become unavailable!`,
        confirmText: 'Unpin',
        cancelText: 'Cancel',
        onConfirm: async () => {
          const success = await unpinFile(index);
          if (success) {
            showToast('File unpinned', 'info');
          } else {
            showToast('Failed to unpin file', 'error');
          }
          setConfirmationModal({ ...confirmationModal, isOpen: false });
        },
        type: 'warning'
      });
    } else {
      const success = await pinFile(index);
      if (success) {
        showToast('File pinned successfully', 'success');
      } else {
        showToast('Failed to pin file', 'error');
      }
    }
  };

  const storageStats = getStorageStats();

  // Handler functions
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
          showToast('✅ Folder created successfully', 'success');
        } else {
          showToast('❌ Failed to create folder', 'error');
        }
        setInputModal({ ...inputModal, isOpen: false });
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
          setInputModal({ ...inputModal, isOpen: false });
          return;
        }
        
        const success = await renameItem(index, newName);
        if (success) {
          showToast('✅ Renamed successfully', 'success');
        } else {
          showToast('❌ Failed to rename', 'error');
        }
        setInputModal({ ...inputModal, isOpen: false });
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
      // Permanently delete from trash
      setConfirmationModal({
        isOpen: true,
        title: 'Permanently Delete',
        message: `⚠️ Permanently delete "${file.name}"?\n\nThis action cannot be undone!`,
        confirmText: 'Delete Forever',
        cancelText: 'Cancel',
        onConfirm: async () => {
          await permanentlyDelete(index);
          setConfirmationModal({ ...confirmationModal, isOpen: false });
        },
        type: 'danger'
      });
    } else {
      // Move to trash
      setConfirmationModal({
        isOpen: true,
        title: 'Move to Trash',
        message: `Move "${file.name}" to trash?`,
        confirmText: 'Move to Trash',
        cancelText: 'Cancel',
        onConfirm: async () => {
          await moveToTrash(index);
          setConfirmationModal({ ...confirmationModal, isOpen: false });
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
      showToast('✅ Restored successfully', 'success');
    }
  };

  const handleDownload = async (file: UploadedFile) => {
    try {
      const response = await fetch(file.gatewayUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Log download
      const index = uploadedFiles.findIndex(f => f.id === file.id);
      if (index !== -1) {
        await addActivityLog(index, 'downloaded');
      }
    } catch (error) {
      console.error('Download failed:', error);
      showToast('❌ Download failed. Please try opening the file instead.', 'error');
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

  const handleViewChange = (view: 'drive' | 'recent' | 'starred' | 'trash') => {
    setActiveView(view);
    if (view === 'drive') {
      // Stay in current folder
    } else {
      // Other views ignore folder navigation
    }
  };

  const folderPath = getFolderPath(currentFolderId);

  const getViewTitle = () => {
    switch (activeView) {
      case 'recent':
        return 'Recent';
      case 'starred':
        return 'Starred';
      case 'trash':
        return 'Trash';
      case 'drive':
      default:
        if (currentFolderId) {
          const currentFolder = uploadedFiles.find(f => f.id === currentFolderId);
          return currentFolder?.name || 'My Drive';
        }
        return 'My Drive';
    }
  };

  // Show loading spinner while checking auth or loading files
  if (loading || filesLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>{loading ? 'Loading...' : 'Loading your files...'}</p>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className={`${styles.dashboard} ${styles[theme]} ${isDragging ? styles.draggingActive : ''}`}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.logoBtn} onClick={() => router.push('/')}>
            <img src="/images/VaultLabsLogoWhtBg.png" alt="Vault Labs" className={styles.logoImg} />
          </button>
          <div className={styles.searchContainer}>
            <div className={styles.searchBar}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                placeholder="Search in Drive"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
              <button 
                className={styles.filterToggle}
                onClick={() => setShowFilters(!showFilters)}
                title="Show filters"
              >
                🎚️
              </button>
            </div>
            {showFilters && (
              <div className={styles.filterPanel}>
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Type</label>
                  <select 
                    value={filters.fileType} 
                    onChange={(e) => setFilters({...filters, fileType: e.target.value as any})}
                    className={styles.filterSelect}
                  >
                    <option value="all">All Types</option>
                    <option value="folder">Folders</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                    <option value="audio">Audio</option>
                    <option value="document">Documents</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Pin Status</label>
                  <select 
                    value={filters.pinStatus} 
                    onChange={(e) => setFilters({...filters, pinStatus: e.target.value as any})}
                    className={styles.filterSelect}
                  >
                    <option value="all">All Files</option>
                    <option value="pinned">📌 Pinned</option>
                    <option value="unpinned">📍 Unpinned</option>
                  </select>
                </div>
                
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Star Status</label>
                  <select 
                    value={filters.starStatus} 
                    onChange={(e) => setFilters({...filters, starStatus: e.target.value as any})}
                    className={styles.filterSelect}
                  >
                    <option value="all">All</option>
                    <option value="starred">⭐ Starred</option>
                    <option value="unstarred">☆ Unstarred</option>
                  </select>
                </div>
                
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Size (MB)</label>
                  <div className={styles.filterRange}>
                    <input 
                      type="number" 
                      placeholder="Min"
                      value={filters.sizeMin}
                      onChange={(e) => setFilters({...filters, sizeMin: e.target.value})}
                      className={styles.filterInput}
                    />
                    <span>to</span>
                    <input 
                      type="number" 
                      placeholder="Max"
                      value={filters.sizeMax}
                      onChange={(e) => setFilters({...filters, sizeMax: e.target.value})}
                      className={styles.filterInput}
                    />
                  </div>
                </div>
                
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Date Range</label>
                  <div className={styles.filterRange}>
                    <input 
                      type="date" 
                      placeholder="From"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                      className={styles.filterInput}
                    />
                    <span>to</span>
                    <input 
                      type="date" 
                      placeholder="To"
                      value={filters.dateTo}
                      onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                      className={styles.filterInput}
                    />
                  </div>
                </div>
                
                <button 
                  className={styles.clearFilters}
                  onClick={() => setFilters({
                    fileType: 'all',
                    pinStatus: 'all',
                    starStatus: 'all',
                    sizeMin: '',
                    sizeMax: '',
                    dateFrom: '',
                    dateTo: ''
                  })}
                >
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        </div>
        <div className={styles.headerRight}>
          <button 
            className={styles.themeToggle}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <div className={styles.userInfo}>
            <span className={styles.userEmail}>{user.email}</span>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div {...getRootProps()} className={styles.uploadSection}>
            <input {...getInputProps()} />
            <button className={styles.newButton} disabled={isUploading}>
              <span className={styles.plusIcon}>+</span>
              {isUploading ? 'Uploading...' : 'New'}
            </button>
          </div>
          
          <nav className={styles.sidebarNav}>
            <div 
              className={`${styles.navItem} ${activeView === 'drive' ? styles.active : ''}`}
              onClick={() => {
                handleViewChange('drive');
                setCurrentFolderId(null);
              }}
            >
              <span className={styles.navIcon}>📁</span>
              <span>My Drive</span>
            </div>
            <div 
              className={`${styles.navItem} ${activeView === 'recent' ? styles.active : ''}`}
              onClick={() => handleViewChange('recent')}
            >
              <span className={styles.navIcon}>⏰</span>
              <span>Recent</span>
            </div>
            <div 
              className={`${styles.navItem} ${activeView === 'starred' ? styles.active : ''}`}
              onClick={() => handleViewChange('starred')}
            >
              <span className={styles.navIcon}>⭐</span>
              <span>Starred</span>
            </div>
            <div 
              className={`${styles.navItem} ${activeView === 'trash' ? styles.active : ''}`}
              onClick={() => handleViewChange('trash')}
            >
              <span className={styles.navIcon}>🗑️</span>
              <span>Trash</span>
            </div>
          </nav>

          {/* Auto-pin Toggle */}
          <div className={styles.autoPinSection}>
            <label className={styles.autoPinLabel}>
              <input 
                type="checkbox" 
                checked={autoPinEnabled}
                onChange={(e) => setAutoPinEnabled(e.target.checked)}
                className={styles.autoPinCheckbox}
              />
              <span className={styles.autoPinText}>
                📌 Auto-pin uploads
              </span>
            </label>
            <p className={styles.autoPinHint}>
              {autoPinEnabled 
                ? '✅ New files will be pinned automatically' 
                : '⚠️ Files may be lost without pinning!'}
            </p>
          </div>

          <div className={styles.storageInfo}>
            <div className={styles.storageStats}>
              <h4 className={styles.storageTitle}>Storage Overview</h4>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Total Files:</span>
                <span className={styles.statValue}>{storageStats.totalFiles}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Total Size:</span>
                <span className={styles.statValue}>{formatFileSize(storageStats.totalSize)}</span>
              </div>
              <hr className={styles.statDivider} />
              <div className={styles.statRow}>
                <span className={styles.statLabel}>📌 Pinned:</span>
                <span className={styles.statValue}>
                  {storageStats.pinnedCount} ({formatFileSize(storageStats.pinnedSize)})
                </span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>⚠️ Unpinned:</span>
                <span className={styles.statValue + ' ' + (storageStats.unpinnedCount > 0 ? styles.warning : '')}>
                  {storageStats.unpinnedCount} ({formatFileSize(storageStats.unpinnedSize)})
                </span>
              </div>
              {storageStats.unpinnedCount > 0 && (
                <p className={styles.warningText}>
                  ⚠️ Unpinned files may be lost!
                </p>
              )}
            </div>
            {uploadedFiles.length > 0 && (
              <button 
                className={styles.syncBtn}
                onClick={() => {
                  const userFileListUri = localStorage.getItem(`user_file_list_uri_${user?.uid}`);
                  if (userFileListUri) {
                    navigator.clipboard.writeText(userFileListUri);
                    showToast('IPFS URI copied! Paste this in another browser to sync your files.', 'success');
                  } else {
                    showToast('No IPFS URI found. Upload a file first.', 'error');
                  }
                }}
                title="Copy IPFS URI to sync across browsers"
              >
                🔗 Sync
              </button>
            )}
          </div>
        </aside>

        {/* File Display Area */}
        <main className={styles.fileArea}>
          {/* Breadcrumb Navigation */}
          {activeView === 'drive' && (
            <div className={styles.breadcrumb}>
              <span 
                className={styles.breadcrumbItem}
                onClick={() => {
                  setCurrentFolderId(null);
                  setActiveView('drive');
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).classList.add('dragOver');
                }}
                onDragLeave={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const isOutside = e.clientX < rect.left || e.clientX >= rect.right ||
                                   e.clientY < rect.top || e.clientY >= rect.bottom;
                  if (isOutside) {
                    (e.currentTarget as HTMLElement).classList.remove('dragOver');
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).classList.remove('dragOver');
                  
                  const draggedFileId = e.dataTransfer.getData('text/plain');
                  if (draggedFileId) {
                    console.log('Moving file to root:', draggedFileId);
                    handleFileMove(draggedFileId, null);
                  }
                }}
              >
                My Drive
              </span>
              {folderPath.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  <span className={styles.breadcrumbSep}> / </span>
                  <span 
                    className={styles.breadcrumbItem}
                    onClick={() => {
                      setCurrentFolderId(folder.id);
                      setActiveView('drive');
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).classList.add('dragOver');
                    }}
                    onDragLeave={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const isOutside = e.clientX < rect.left || e.clientX >= rect.right ||
                                       e.clientY < rect.top || e.clientY >= rect.bottom;
                      if (isOutside) {
                        (e.currentTarget as HTMLElement).classList.remove('dragOver');
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).classList.remove('dragOver');
                      
                      const draggedFileId = e.dataTransfer.getData('text/plain');
                      if (draggedFileId) {
                        console.log('Moving file to folder:', folder.name);
                        handleFileMove(draggedFileId, folder.id);
                      }
                    }}
                  >
                    {folder.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <h2>{getViewTitle()}</h2>
              {activeView === 'drive' && (
                <button 
                  className={styles.newFolderBtn}
                  onClick={handleCreateFolder}
                  title="Create new folder"
                >
                  📁+ New Folder
                </button>
              )}
            </div>
            <div className={styles.toolbarRight}>
              {/* Sorting dropdown */}
              <select 
                className={styles.sortSelect}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                title="Sort by"
              >
                <option value="name">Name</option>
                <option value="date">Modified</option>
                <option value="size">Size</option>
                <option value="type">Type</option>
              </select>
              <button 
                className={styles.sortDirection}
                onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                title={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </button>
              <button 
                className={viewMode === 'grid' ? styles.viewBtnActive : styles.viewBtn}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                ▦
              </button>
              <button 
                className={viewMode === 'list' ? styles.viewBtnActive : styles.viewBtn}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                ☰
              </button>
              {uploadedFiles.length > 0 && activeView !== 'trash' && (
                <button className={styles.clearBtn} onClick={clearAll}>
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Upload Dropzone Overlay */}
          {isDragActive && (
            <div className={styles.dropOverlay}>
              <div className={styles.dropMessage}>
                <span className={styles.dropIcon}>📤</span>
                <p>Drop files here to upload</p>
              </div>
            </div>
          )}

          {/* Files Display */}
          {filteredFiles.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>
                {activeView === 'trash' ? '🗑️' : activeView === 'starred' ? '⭐' : '📂'}
              </span>
              <h3>
                {activeView === 'trash' ? 'Trash is empty' : 
                 activeView === 'starred' ? 'No starred items' :
                 activeView === 'recent' ? 'No recent files' :
                 'No files yet'}
              </h3>
              <p>
                {activeView === 'trash' ? 'Items you delete will appear here' :
                 activeView === 'starred' ? 'Star items to find them easily' :
                 activeView === 'recent' ? 'Recently accessed files will appear here' :
                 'Upload files to see them here'}
              </p>
              {activeView === 'drive' && (
                <>
              <div {...getRootProps()}>
                <input {...getInputProps()} />
                <button className={styles.emptyUploadBtn}>
                  Upload Files
                </button>
              </div>
              
              {/* Sync from IPFS URI */}
              <div className={styles.syncSection}>
                <p>Or sync files from another browser:</p>
                <input
                  type="text"
                  placeholder="Paste IPFS URI here (ipfs://...)"
                  className={styles.syncInput}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      const uri = (e.target as HTMLInputElement).value;
                      if (uri.startsWith('ipfs://') && user) {
                        localStorage.setItem(`user_file_list_uri_${user.uid}`, uri);
                        window.location.reload();
                      } else {
                        showToast('Please enter a valid IPFS URI (starts with ipfs://)', 'error');
                      }
                    }
                  }}
                />
                <p className={styles.syncHint}>Press Enter to sync</p>
              </div>
                </>
              )}
            </div>
          ) : (
            <div className={viewMode === 'grid' ? styles.fileGrid : styles.fileList}>
              {filteredFiles.map((file) => {
                return (
                <div 
                  key={file.id} 
                  className={viewMode === 'grid' ? styles.fileCard : styles.fileRow}
                  onClick={() => file.isFolder ? handleFileClick(file) : null}
                  onDoubleClick={() => !file.isFolder ? handleFileClick(file) : null}
                  data-folder-id={file.isFolder ? file.id : undefined}
                  data-file-id={!file.isFolder ? file.id : undefined}
                  draggable={!file.isFolder}
                  onDragStart={(e) => {
                    if (!file.isFolder) {
                      console.log('=== DRAG START ===', file.id, file.name);
                      e.dataTransfer.setData('text/plain', file.id);
                      e.dataTransfer.effectAllowed = 'move';
                      
                      // Create custom drag image
                      const dragElement = e.currentTarget as HTMLElement;
                      const clone = dragElement.cloneNode(true) as HTMLElement;
                      clone.style.position = 'absolute';
                      clone.style.top = '-9999px';
                      clone.style.width = dragElement.offsetWidth + 'px';
                      clone.style.height = dragElement.offsetHeight + 'px';
                      clone.style.transform = 'scale(0.8) rotate(5deg)';
                      clone.style.opacity = '1.0';
                      clone.style.pointerEvents = 'none';
                      document.body.appendChild(clone);
                      
                      // Set the clone as the drag image
                      e.dataTransfer.setDragImage(clone, dragElement.offsetWidth / 2, dragElement.offsetHeight / 2);
                      
                      // Remove clone after a short delay
                      setTimeout(() => {
                        document.body.removeChild(clone);
                      }, 0);
                      
                      e.currentTarget.classList.add(styles.dragging);
                      setIsDragging(true);
                      // Prevent event from bubbling
                      e.stopPropagation();
                    } else {
                      e.preventDefault();
                    }
                  }}
                  onDragEnd={(e) => {
                    if (!file.isFolder) {
                      console.log('=== DRAG END ===');
                      e.currentTarget.classList.remove(styles.dragging);
                      setIsDragging(false);
                    }
                  }}
                  onDragEnter={(e) => {
                    if (file.isFolder) {
                      console.log('=== DRAG ENTER FOLDER ===', file.name);
                      e.preventDefault();
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).classList.add('dragOver');
                    }
                  }}
                  onDragLeave={(e) => {
                    if (file.isFolder) {
                      console.log('=== DRAG LEAVE FOLDER ===', file.name);
                      // Only remove if we're actually leaving the element (not a child)
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const isOutside = e.clientX < rect.left || e.clientX >= rect.right ||
                                       e.clientY < rect.top || e.clientY >= rect.bottom;
                      if (isOutside) {
                        (e.currentTarget as HTMLElement).classList.remove('dragOver');
                      }
                    }
                  }}
                  onDragOver={(e) => {
                    if (file.isFolder) {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(e) => {
                    console.log('=== DROP EVENT ===', file.isFolder ? 'FOLDER' : 'FILE', file.name);
                    if (file.isFolder) {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).classList.remove('dragOver');
                      
                      // Check if we're dropping files from the file system
                      const droppedFiles = Array.from(e.dataTransfer.files);
                      console.log('Dropped system files count:', droppedFiles.length);
                      
                      if (droppedFiles.length > 0) {
                        // Dropping files from file system
                        console.log('Handling folder drop for system files');
                        handleFolderDrop(file.id, droppedFiles);
                      } else {
                        // Dropping a file card (moving existing file)
                        const draggedFileId = e.dataTransfer.getData('text/plain');
                        console.log('Dragged file ID:', draggedFileId, 'Target folder:', file.id);
                        if (draggedFileId && draggedFileId !== file.id) {
                          console.log('Moving file to folder...');
                          handleFileMove(draggedFileId, file.id);
                        } else {
                          console.log('Invalid drop - same ID or no ID');
                        }
                      }
                    }
                  }}
                >
                  {/* File Preview/Icon */}
                  <div className={styles.filePreview}>
                    {file.isFolder ? (
                      <>
                        <div className={styles.folderIconLarge}>
                          📁
                        </div>
                        {/* Overlay star button for folders */}
                        <div className={styles.imageOverlay}>
                          <button
                            className={styles.overlayBtn + ' ' + styles.overlayBtnTopLeft}
                            onClick={(e) => handleToggleStar(file.id, e)}
                            title={file.starred ? "Unstar" : "Star"}
                          >
                            {file.starred ? '⭐' : '☆'}
                          </button>
                        </div>
                      </>
                    ) : file.type.startsWith('image/') ? (
                      <>
                        <img 
                          src={file.gatewayUrl} 
                          alt={file.name} 
                          className={styles.fileThumbnail}
                          draggable={false}
                        />
                        {/* Overlay buttons for images */}
                        <div className={styles.imageOverlay}>
                          <button
                            className={styles.overlayBtn + ' ' + styles.overlayBtnTopLeft}
                            onClick={(e) => handleToggleStar(file.id, e)}
                            title={file.starred ? "Unstar" : "Star"}
                          >
                            {file.starred ? '⭐' : '☆'}
                          </button>
                          <button
                            className={styles.overlayBtn + ' ' + styles.overlayBtnTopRight}
                            onClick={(e) => handlePinToggle(file.id, file, e)}
                            title={file.isPinned ? "📌 Pinned - Click to unpin (file may be lost)" : "📍 Unpinned - Click to pin (file may be lost)"}
                          >
                            {file.isPinned ? '📌' : '📍'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className={styles.fileIconLarge}>
                        {getFileIcon(file.type)}
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className={styles.fileInfo}>
                    <div className={styles.fileNameRow}>
                    <h4 className={styles.fileName} title={file.name}>{file.name}</h4>
                      {file.starred && (
                        <span className={styles.starredBadge} title="Starred">⭐</span>
                      )}
                    </div>
                    <div className={styles.fileMeta}>
                      {file.isFolder ? (
                        <span>Folder</span>
                      ) : (
                        <>
                      <span>{formatFileSize(file.size)}</span>
                      <span>•</span>
                        </>
                      )}
                      <span>{new Date(file.modifiedDate || file.timestamp).toLocaleDateString()}</span>
                      {file.pinService && !file.isFolder && (
                        <>
                          <span>•</span>
                          <span title="Pinning service">{file.pinService}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* File Actions */}
                  <div className={styles.fileActions}>
                    {/* Show star/pin buttons inline for list view, or for non-images/non-folders in grid view */}
                    {(viewMode === 'list' || (!file.type.startsWith('image/') && !file.isFolder)) && (
                      <>
                        <button 
                          className={styles.actionBtn}
                          onClick={(e) => { e.stopPropagation(); handleToggleStar(file.id); }}
                          title={file.starred ? "Unstar" : "Star"}
                        >
                          {file.starred ? '⭐' : '☆'}
                        </button>
                        <button 
                          className={styles.actionBtn}
                          onClick={(e) => { e.stopPropagation(); handlePinToggle(file.id, file); }}
                          title={file.isPinned ? "📌 Pinned - Click to unpin (file may be lost)" : "📍 Unpinned - Click to pin (file may be lost)"}
                        >
                          {file.isPinned ? '📌' : '📍'}
                        </button>
                      </>
                    )}
                    
                    {/* 3-dot menu button */}
                    <div className={styles.menuContainer + ' imageMenu'}>
                      <button 
                        className={styles.moreBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === file.id ? null : file.id);
                        }}
                        title="More actions"
                      >
                        ⋮
                      </button>
                      
                      {/* Dropdown menu */}
                      {openMenuId === file.id && (
                        <div className={styles.dropdownMenu + ' imageMenu'}>
                          {activeView !== 'trash' ? (
                            <>
                              {!file.isFolder && (
                                <>
                                  <button onClick={(e) => { e.stopPropagation(); handleDownload(file); setOpenMenuId(null); }}>
                                    ⬇️ Download
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); window.open(file.gatewayUrl, '_blank'); setOpenMenuId(null); }}>
                                    👁️ Open
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); copyToClipboard(file.gatewayUrl); setOpenMenuId(null); }}>
                                    🔗 Copy Link
                                  </button>
                                </>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); handleShare(file.id); setOpenMenuId(null); }}>
                                🔗 Share
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleRename(file.id); setOpenMenuId(null); }}>
                                ✏️ Rename
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(file.id); setOpenMenuId(null); }} className={styles.menuDanger}>
                                🗑️ Trash
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); handleRestore(file.id); setOpenMenuId(null); }}>
                                ↩️ Restore
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(file.id); setOpenMenuId(null); }} className={styles.menuDanger}>
                                ❌ Delete Forever
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Share Modal */}
      {shareModalFile && (
        <ShareModal
          fileName={shareModalFile.name}
          isOpen={true}
          onClose={() => setShareModalFile(null)}
          onShare={handleCreateShare}
          onDisableShare={handleDisableShare}
          existingShare={shareModalFile.shareConfig}
          isFolder={shareModalFile.isFolder}
        />
      )}

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={confirmationModal.confirmText}
        cancelText={confirmationModal.cancelText}
        onConfirm={confirmationModal.onConfirm}
        onCancel={() => setConfirmationModal({ ...confirmationModal, isOpen: false })}
        type={confirmationModal.type}
      />

      {/* Input Modal */}
      <InputModal
        isOpen={inputModal.isOpen}
        title={inputModal.title}
        message={inputModal.message}
        placeholder={inputModal.placeholder}
        defaultValue={inputModal.defaultValue}
        onConfirm={inputModal.onConfirm}
        onCancel={() => setInputModal({ ...inputModal, isOpen: false })}
      />

      {/* Upload Progress Panel */}
      {uploadQueue.length > 0 && (
        <div className={styles.uploadPanel}>
          <div className={styles.uploadHeader}>
            <h4>Uploading {uploadQueue.length} file{uploadQueue.length > 1 ? 's' : ''}</h4>
            <button onClick={() => setUploadQueue([])} className={styles.closeUploadPanel}>✕</button>
          </div>
          <div className={styles.uploadList}>
            {uploadQueue.map((item, index) => (
              <div key={index} className={styles.uploadItem}>
                <div className={styles.uploadItemInfo}>
                  <span className={styles.uploadItemName}>{item.name}</span>
                  <span className={styles.uploadItemProgress}>
                    {item.status === 'complete' ? '✓' : item.status === 'error' ? '✗' : `${Math.round(item.progress)}%`}
                  </span>
                </div>
                <div className={styles.progressBar}>
                  <div 
                    className={`${styles.progressFill} ${styles[item.status]}`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

