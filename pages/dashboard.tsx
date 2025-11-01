import React, { useState, useEffect } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useStorageUpload } from '@thirdweb-dev/react';
import { useDropzone } from 'react-dropzone';
import JSZip from 'jszip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/DropdownMenu';
import { useAuth } from '../contexts/AuthContext';
import { useUserFileStorage } from '../hooks/useUserFileStorage';
import { ErrorHandler } from '../lib/errorHandler';
import ShareModal from '../components/ShareModal';
import PreviewModal from '../components/PreviewModal';
import FileDetailsPanel from '../components/FileDetailsPanel';
import SkeletonLoader from '../components/SkeletonLoader';
import StorageCleanupModal from '../components/StorageCleanupModal';
import TagManager from '../components/TagManager';
import FilePreviewHover from '../components/FilePreviewHover';
import ColumnSettings from '../components/ColumnSettings';
import GatewaySettings from '../components/GatewaySettings';
import TwoFactorSetup from '../components/TwoFactorSetup';
import VersionHistory from '../components/VersionHistory';
import NotificationBell from '../components/NotificationBell';
import Toast from '../components/Toast';
import ConfirmationModal from '../components/ConfirmationModal';
import InputModal from '../components/InputModal';
import { calculatePinningCost } from '../lib/pinningService';
import { getOptimizedGatewayUrl } from '../lib/gatewayOptimizer';
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
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<Array<{ name: string; query: string; filters: typeof filters }>>([]);
  const [showSavedSearchesMenu, setShowSavedSearchesMenu] = useState(false);
  const [activeView, setActiveView] = useState<'drive' | 'recent' | 'starred' | 'trash'>('drive');
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [shareModalFile, setShareModalFile] = useState<UploadedFile | null>(null);
  const [previewModalFile, setPreviewModalFile] = useState<UploadedFile | null>(null);
  const [detailsPanelFile, setDetailsPanelFile] = useState<UploadedFile | null>(null);
  const [showStorageCleanup, setShowStorageCleanup] = useState(false);
  const [tagManagerFile, setTagManagerFile] = useState<UploadedFile | null>(null);
  const [hoverPreviewFile, setHoverPreviewFile] = useState<UploadedFile | null>(null);
  const [hoverPreviewPosition, setHoverPreviewPosition] = useState({ x: 0, y: 0 });
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showGatewaySettings, setShowGatewaySettings] = useState(false);
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [versionHistoryFile, setVersionHistoryFile] = useState<UploadedFile | null>(null);
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    size: true,
    type: true,
    modified: true,
    pinStatus: true,
    tags: true,
    starStatus: true,
  });
  const [filters, setFilters] = useState({
    fileType: 'all' as 'all' | 'image' | 'video' | 'audio' | 'document' | 'folder' | 'other',
    pinStatus: 'all' as 'all' | 'pinned' | 'unpinned',
    starStatus: 'all' as 'all' | 'starred' | 'unstarred',
    tags: [] as string[],
    sizeMin: '' as string,
    sizeMax: '' as string,
    dateFrom: '' as string,
    dateTo: '' as string,
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isDragging, setIsDragging] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
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
    error: filesError,
    clearError: clearFilesError,
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
    autoCleanupTrash,
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
    addActivityLog,
    // Duplicate functions
    checkDuplicates,
    duplicateFile,
    getFileDuplicates,
    // Tag functions
    addTags,
    removeTags,
    setTags,
    getAllTags,
    getFilesByTag,
    // Custom Properties functions
    updateCustomProperties
  } = useUserFileStorage(user?.uid || null);

  // Load column preferences from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vault_list_columns');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setVisibleColumns(prev => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error('Failed to load column preferences:', e);
        }
      }
    }
  }, []);

  // Save column preferences to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vault_list_columns', JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Load recent searches and saved searches from localStorage
  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`recent_searches_${user.uid}`);
      if (saved) {
        try {
          setRecentSearches(JSON.parse(saved));
        } catch (e) {
          // Ignore parse errors
        }
      }
      const savedSearchesData = localStorage.getItem(`saved_searches_${user.uid}`);
      if (savedSearchesData) {
        try {
          setSavedSearches(JSON.parse(savedSearchesData));
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }, [user]);

  // Generate search suggestions based on file names
  useEffect(() => {
    if (searchTerm.length > 0) {
      const suggestions = uploadedFiles
        .filter(file => 
          !file.trashed && 
          file.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .map(file => file.name)
        .slice(0, 5);
      setSearchSuggestions(suggestions);
      setShowSuggestions(true);
    } else {
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
  }, [searchTerm, uploadedFiles]);

  // Save search to recent searches
  const saveSearch = (term: string) => {
    if (!user || !term.trim()) return;
    
    const updated = [term, ...recentSearches.filter(s => s !== term)].slice(0, 10);
    setRecentSearches(updated);
    localStorage.setItem(`recent_searches_${user.uid}`, JSON.stringify(updated));
  };

  // Save current search as a saved search
  const saveCurrentSearch = () => {
    if (!user) return;
    
    const hasActiveSearch = searchTerm.trim() || Object.values(filters).some(v => v !== 'all' && v !== '');
    if (!hasActiveSearch) {
      showToast('No search query or filters to save', 'info');
      return;
    }

    setInputModal({
      isOpen: true,
      title: 'Save Search',
      message: 'Enter a name for this search:',
      placeholder: 'Search name (e.g., "Large PDFs", "Pinned Images")',
      defaultValue: '',
      onConfirm: (name) => {
        if (!name.trim()) {
          setInputModal({ ...inputModal, isOpen: false });
          return;
        }
        const newSavedSearch = {
          name: name.trim(),
          query: searchTerm,
          filters: { ...filters }
        };
        const updated = [...savedSearches.filter(s => s.name !== name.trim()), newSavedSearch];
        setSavedSearches(updated);
        localStorage.setItem(`saved_searches_${user.uid}`, JSON.stringify(updated));
        setInputModal({ ...inputModal, isOpen: false });
        showToast('✅ Search saved successfully', 'success');
      }
    });
  };

  // Load a saved search
  const loadSavedSearch = (savedSearch: { name: string; query: string; filters: typeof filters }) => {
    setSearchTerm(savedSearch.query);
    setFilters(savedSearch.filters);
    setShowSuggestions(false);
    showToast(`Loaded search: ${savedSearch.name}`, 'success');
  };

  // Delete a saved search
  const deleteSavedSearch = (name: string) => {
    if (!user) return;
    const updated = savedSearches.filter(s => s.name !== name);
    setSavedSearches(updated);
    localStorage.setItem(`saved_searches_${user.uid}`, JSON.stringify(updated));
    showToast('✅ Search deleted', 'success');
  };

  // Auto-cleanup trash on mount and when entering trash view
  useEffect(() => {
    if (activeView === 'trash' && user && uploadedFiles.length > 0) {
      // Cleanup files older than 30 days automatically
      autoCleanupTrash().catch(console.error);
    }
  }, [activeView, user, uploadedFiles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs, textareas, or when modals are open
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || confirmationModal.isOpen || inputModal.isOpen || shareModalFile) {
        // Allow Escape to close modals
        if (e.key === 'Escape' && (confirmationModal.isOpen || inputModal.isOpen || shareModalFile)) {
          if (shareModalFile) {
            setShareModalFile(null);
          } else if (inputModal.isOpen) {
            setInputModal({ ...inputModal, isOpen: false });
          } else if (confirmationModal.isOpen) {
            setConfirmationModal({ ...confirmationModal, isOpen: false });
          }
        }
        return;
      }

      // Ctrl+K or Cmd+K or / - Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector(`.${styles.searchInput}`) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      } else if (e.key === '/' && !searchTerm) {
        e.preventDefault();
        const searchInput = document.querySelector(`.${styles.searchInput}`) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
      // Escape - Clear search, close menus
      else if (e.key === 'Escape') {
        if (searchTerm) {
          setSearchTerm('');
          setShowSuggestions(false);
        }
        if (showFilters) {
          setShowFilters(false);
        }
      }
      // Ctrl+N or Cmd+N - New folder (when in drive view)
      else if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (activeView === 'drive') {
          // Trigger folder creation via input modal directly
          setInputModal({
            isOpen: true,
            title: 'Create Folder',
            message: 'Enter folder name:',
            placeholder: 'Folder name',
            defaultValue: '',
            onConfirm: async (folderName: string) => {
              if (folderName.trim()) {
                const success = await createFolder(folderName.trim(), currentFolderId);
                if (success) {
                  showToast('✅ Folder created successfully', 'success');
                } else {
                  const appError = ErrorHandler.createAppError(new Error('Failed to create folder'));
          showToast(appError.userMessage, 'error');
                }
                setInputModal({ isOpen: false, title: '', message: '', placeholder: '', defaultValue: '', onConfirm: async () => {} });
              }
            }
          });
        }
      }
      // Ctrl+, or Cmd+, - Toggle theme
      else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setTheme(theme === 'light' ? 'dark' : 'light');
      }
      // 1 - My Drive
      else if (e.key === '1' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveView('drive');
        setCurrentFolderId(null);
      }
      // 2 - Recent
      else if (e.key === '2' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveView('recent');
      }
      // 3 - Starred
      else if (e.key === '3' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveView('starred');
      }
      // 4 - Trash
      else if (e.key === '4' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveView('trash');
      }
      // g then v - Grid view
      else if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        // Will handle on next key press
        const handleNextKey = (nextEvent: KeyboardEvent) => {
          if (nextEvent.key === 'v' || nextEvent.key === 'V') {
            e.preventDefault();
            setViewMode('grid');
          } else if (nextEvent.key === 'l' || nextEvent.key === 'L') {
            e.preventDefault();
            setViewMode('list');
          }
          document.removeEventListener('keydown', handleNextKey);
        };
        document.addEventListener('keydown', handleNextKey, { once: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchTerm, showFilters, activeView, theme, confirmationModal.isOpen, inputModal.isOpen, shareModalFile]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const totalSize = largeFiles.reduce((sum, f) => sum + f.size, 0);
      const costEstimate = calculatePinningCost(totalSize, 365);
      const fileNames = largeFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ');
      setConfirmationModal({
        isOpen: true,
        title: 'Large Files Detected',
        message: `Large files detected:\n${fileNames}\n\nTotal size: ${formatFileSize(totalSize)}\nEstimated pinning cost (1 year): ${costEstimate}\n\nLarge files may take longer to upload and cost more to pin. Continue?`,
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
      const totalSize = largeFiles.reduce((sum, f) => sum + f.size, 0);
      const costEstimate = calculatePinningCost(totalSize, 365);
      const fileNames = largeFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ');
      setConfirmationModal({
        isOpen: true,
        title: 'Large Files Detected',
        message: `Large files detected:\n${fileNames}\n\nTotal size: ${formatFileSize(totalSize)}\nEstimated pinning cost (1 year): ${costEstimate}\n\nLarge files may take longer to upload and cost more to pin. Continue?`,
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
      const appError = ErrorHandler.createAppError(new Error('Failed to move file'));
      showToast(appError.userMessage, 'error');
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
        gatewayUrl: getOptimizedGatewayUrl(uris[index]),
        timestamp: Date.now(),
        type: file.type || 'unknown',
        size: file.size,
        isPinned: autoPinEnabled,
        pinService: autoPinEnabled ? 'local' : undefined,
        pinDate: autoPinEnabled ? Date.now() : undefined,
        parentFolderId: folderId,
        modifiedDate: Date.now()
      }));

      // Check for duplicates before adding
      const duplicateWarnings: string[] = [];
      newFiles.forEach(file => {
        const duplicates = checkDuplicates(file, folderId);
        if (duplicates.length > 0) {
          const dup = duplicates[0];
          if (dup.confidence === 'high') {
            duplicateWarnings.push(`"${file.name}" already exists (same content)`);
          } else if (dup.confidence === 'medium') {
            duplicateWarnings.push(`"${file.name}" may be a duplicate (same name, size, type)`);
          }
        }
      });

      if (duplicateWarnings.length > 0) {
        showToast(`⚠️ Possible duplicates detected: ${duplicateWarnings.slice(0, 2).join(', ')}${duplicateWarnings.length > 2 ? '...' : ''}`, 'info');
      }

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
        gatewayUrl: getOptimizedGatewayUrl(uris[index]),
        timestamp: Date.now(),
        type: file.type || 'unknown',
        size: file.size,
        isPinned: autoPinEnabled,
        pinService: autoPinEnabled ? 'local' : undefined,
        pinDate: autoPinEnabled ? Date.now() : undefined,
        parentFolderId: currentFolderId,
        modifiedDate: Date.now()
      }));

      // Check for duplicates before adding
      const duplicateWarnings: string[] = [];
      newFiles.forEach(file => {
        const duplicates = checkDuplicates(file, currentFolderId);
        if (duplicates.length > 0) {
          const dup = duplicates[0];
          if (dup.confidence === 'high') {
            duplicateWarnings.push(`"${file.name}" already exists (same content)`);
          } else if (dup.confidence === 'medium') {
            duplicateWarnings.push(`"${file.name}" may be a duplicate (same name, size, type)`);
          }
        }
      });

      if (duplicateWarnings.length > 0) {
        showToast(`⚠️ Possible duplicates detected: ${duplicateWarnings.slice(0, 2).join(', ')}${duplicateWarnings.length > 2 ? '...' : ''}`, 'info');
      }

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
    
    // Tags filter
    if (filters.tags.length > 0) {
      const fileTags = file.tags || [];
      const hasAllTags = filters.tags.every(filterTag =>
        fileTags.some(fileTag => fileTag.toLowerCase() === filterTag.toLowerCase())
      );
      if (!hasAllTags) return false;
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
            const appError = ErrorHandler.createAppError(new Error('Failed to unpin file'));
            showToast(appError.userMessage, 'error');
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
        const appError = ErrorHandler.createAppError(new Error('Failed to pin file'));
        showToast(appError.userMessage, 'error');
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
          const appError = ErrorHandler.createAppError(new Error('Failed to create folder'));
          showToast(appError.userMessage, 'error');
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

  const handlePreview = (file: UploadedFile) => {
    if (file.isFolder) return;
    setPreviewModalFile(file);
    const index = uploadedFiles.findIndex(f => f.id === file.id);
    if (index !== -1) {
      updateLastAccessed(index);
      
      // Cache the file when previewed
      const fileCache = getFileCache();
      fileCache.set(file.id, file);
    }
  };

  const handleShowDetails = (file: UploadedFile) => {
    if (file.isFolder) return;
    setDetailsPanelFile(file);
  };

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

      // Restore file to the selected version
      const updatedFiles = [...uploadedFiles];
      updatedFiles[index] = {
        ...updatedFiles[index],
        ipfsUri: version.ipfsUri,
        gatewayUrl: version.gatewayUrl,
        modifiedDate: Date.now(),
        size: version.size,
      };

      setUploadedFiles(updatedFiles);
      
      // Update the file in storage
      const fileIndex = uploadedFiles.findIndex(f => f.id === versionHistoryFile.id);
      if (fileIndex !== -1) {
        await renameItem(fileIndex, versionHistoryFile.name); // This will trigger a save
        // Manually update the file
        const currentFiles = uploadedFiles;
        currentFiles[fileIndex] = updatedFiles[index];
        await addFiles([currentFiles[fileIndex]], currentFiles[fileIndex].parentFolderId || null);
      }

      // Create a new version entry for the restore action
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
            versionId: undefined, // Will be generated
            version: undefined, // Will be calculated
            changeDescription: `Restored from version ${version.version}`,
            timestamp: Date.now(),
            modifiedDate: Date.now(),
          },
        }),
      });

      showToast(`✅ Restored to version ${version.version}`, 'success');
      setVersionHistoryFile(null);
    } catch (error: any) {
      const appError = ErrorHandler.createAppError(error);
      showToast(appError.userMessage, 'error');
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
          const appError = ErrorHandler.createAppError(new Error('Failed to rename'));
          showToast(appError.userMessage, 'error');
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
      const fileCache = getFileCache();
      
      // Check cache first
      const cached = fileCache.get(file.id);
      let blob: Blob;
      
      if (cached?.content instanceof Blob) {
        // Use cached content
        blob = cached.content;
      } else {
        // Fetch from gateway
        const response = await fetch(file.gatewayUrl);
        blob = await response.blob();
        
        // Cache the file content
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
      
      // Log download
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
      showToast(`✅ File duplicated: "${file.name}"`, 'success');
    } else {
      const appError = ErrorHandler.createAppError(new Error('Failed to duplicate file'));
      showToast(appError.userMessage, 'error');
    }
  };

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
        showToast(`✅ Tag "${tag}" added`, 'success');
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
        showToast(`✅ Tag "${tag}" removed`, 'success');
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

  const handleViewChange = (view: 'drive' | 'recent' | 'starred' | 'trash') => {
    setActiveView(view);
    if (view === 'drive') {
      // Stay in current folder
    } else {
      // Other views ignore folder navigation
    }
  };

  // Get all files recursively (build folder structure)
  const getAllFilesRecursively = (folderId: string | null, files: UploadedFile[], path: string = ''): Array<{file: UploadedFile, path: string}> => {
    const result: Array<{file: UploadedFile, path: string}> = [];
    
    files.forEach(file => {
      if (file.parentFolderId === folderId && !file.isFolder && !file.trashed) {
        result.push({ file, path });
      }
    });

    // Recurse into folders
    files.forEach(folder => {
      if (folder.isFolder && folder.parentFolderId === folderId && !folder.trashed) {
        const folderPath = path ? `${path}/${folder.name}` : folder.name;
        const folderFiles = getAllFilesRecursively(folder.id, files, folderPath);
        result.push(...folderFiles);
      }
    });

    return result;
  };

  const handleExportAll = async () => {
    const nonTrashedFiles = uploadedFiles.filter(f => !f.trashed && !f.isFolder);
    
    if (nonTrashedFiles.length === 0) {
      showToast('No files to export', 'info');
      return;
    }

    try {
      showToast('📦 Preparing ZIP file...', 'info');
      const zip = new JSZip();
      
      // Get all files with their folder paths
      const allFilesWithPaths = getAllFilesRecursively(null, uploadedFiles);
      
      if (allFilesWithPaths.length === 0) {
        showToast('No files to export', 'info');
        return;
      }

      let processed = 0;
      const total = allFilesWithPaths.length;
      
      // Download and add each file to ZIP
      for (const { file, path } of allFilesWithPaths) {
        try {
          const response = await fetch(file.gatewayUrl);
          if (!response.ok) {
            console.warn(`Failed to fetch ${file.name}, skipping...`);
            continue;
          }
          const blob = await response.blob();
          const zipPath = path ? `${path}/${file.name}` : file.name;
          zip.file(zipPath, blob);
          
          processed++;
          if (processed % 10 === 0 || processed === total) {
            showToast(`📦 Exporting... ${processed}/${total} files`, 'info');
          }
        } catch (error) {
          console.error(`Error fetching ${file.name}:`, error);
          // Continue with other files even if one fails
        }
      }

      // Generate ZIP file
      showToast('📦 Generating ZIP file...', 'info');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Download the ZIP
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vault-export-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showToast(`✅ Exported ${processed} files successfully!`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('❌ Export failed. Please try again.', 'error');
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

  // Show loading spinner only for initial auth check
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading...</p>
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
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (e.target.value.trim() && e.target.value !== searchTerm) {
                    saveSearch(e.target.value.trim());
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    saveSearch(searchTerm.trim());
                    setShowSuggestions(false);
                  }
                }}
                onFocus={() => {
                  if (searchTerm.length > 0 || recentSearches.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                onBlur={() => {
                  // Delay to allow click on suggestions
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
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
            {/* Search Suggestions Dropdown */}
            {showSuggestions && (searchSuggestions.length > 0 || (searchTerm.length === 0 && (recentSearches.length > 0 || savedSearches.length > 0))) && (
              <div className={styles.searchSuggestions}>
                {searchTerm.length === 0 && savedSearches.length > 0 && (
                  <>
                    <div className={styles.suggestionHeader}>
                      <span>Saved Searches</span>
                      <button 
                        className={styles.saveSearchBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          saveCurrentSearch();
                        }}
                        title="Save current search"
                      >
                        💾 Save
                      </button>
                    </div>
                    {savedSearches.map((savedSearch, idx) => (
                      <div
                        key={`saved-${idx}`}
                        className={styles.suggestionItem}
                        onClick={() => {
                          loadSavedSearch(savedSearch);
                        }}
                      >
                        <span className={styles.suggestionIcon}>⭐</span>
                        <span className={styles.suggestionText}>{savedSearch.name}</span>
                        <button
                          className={styles.deleteSavedSearchBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSavedSearch(savedSearch.name);
                          }}
                          title="Delete saved search"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </>
                )}
                {searchTerm.length === 0 && recentSearches.length > 0 && (
                  <>
                    {savedSearches.length > 0 && <div className={styles.suggestionDivider}></div>}
                    <div className={styles.suggestionHeader}>Recent Searches</div>
                    {recentSearches.map((search, idx) => (
                      <div
                        key={`recent-${idx}`}
                        className={styles.suggestionItem}
                        onClick={() => {
                          setSearchTerm(search);
                          saveSearch(search);
                          setShowSuggestions(false);
                        }}
                      >
                        <span className={styles.suggestionIcon}>🕐</span>
                        <span>{search}</span>
                      </div>
                    ))}
                  </>
                )}
                {searchSuggestions.length > 0 && (
                  <>
                    {searchTerm.length > 0 && recentSearches.length > 0 && <div className={styles.suggestionDivider}></div>}
                    <div className={styles.suggestionHeader}>Suggestions</div>
                    {searchSuggestions.map((suggestion, idx) => (
                      <div
                        key={`suggestion-${idx}`}
                        className={styles.suggestionItem}
                        onClick={() => {
                          setSearchTerm(suggestion);
                          saveSearch(suggestion);
                          setShowSuggestions(false);
                        }}
                      >
                        <span className={styles.suggestionIcon}>🔍</span>
                        <span>{suggestion}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
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
                  <label className={styles.filterLabel}>Tags</label>
                  <div className={styles.tagFilter}>
                    {getAllTags().length > 0 ? (
                      <select
                        multiple
                        value={filters.tags}
                        onChange={(e) => {
                          const selectedTags = Array.from(e.target.selectedOptions, option => option.value);
                          setFilters({...filters, tags: selectedTags});
                        }}
                        className={styles.tagSelect}
                        size={Math.min(5, getAllTags().length + 1)}
                      >
                        {getAllTags().map(tag => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={styles.noTagsHint}>No tags yet - add tags to files to filter by them</span>
                    )}
                    {filters.tags.length > 0 && (
                      <button
                        className={styles.clearTagFilterBtn}
                        onClick={() => setFilters({...filters, tags: []})}
                        title="Clear tag filter"
                      >
                        Clear Tags
                      </button>
                    )}
                  </div>
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
                
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                  <button 
                    className={styles.clearFilters}
                    onClick={() => setFilters({
                      fileType: 'all',
                      pinStatus: 'all',
                      starStatus: 'all',
                      tags: [],
                      sizeMin: '',
                      sizeMax: '',
                      dateFrom: '',
                      dateTo: ''
                    })}
                  >
                    Clear All Filters
                  </button>
                  <button 
                    className={styles.saveSearchBtnFilter}
                    onClick={() => {
                      saveCurrentSearch();
                      setShowFilters(false);
                    }}
                    title="Save current search with filters"
                  >
                    💾 Save Search
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className={styles.headerRight}>
          {/* Keyboard Shortcuts Card */}
          <div 
            className={styles.keyboardShortcutsCard}
            onMouseEnter={() => setShowKeyboardShortcuts(true)}
            onMouseLeave={() => setShowKeyboardShortcuts(false)}
          >
            <span className={styles.keyboardShortcutsLabel}>⌨️ Keyboard Shortcuts</span>
            {showKeyboardShortcuts && (
              <div className={styles.keyboardShortcutsTooltip}>
                <div className={styles.shortcutItem}>
                  <span className={styles.shortcutKey}>Ctrl+K</span> or <span className={styles.shortcutKey}>/</span>
                  <span className={styles.shortcutAction}>Focus search</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.shortcutKey}>Esc</span>
                  <span className={styles.shortcutAction}>Clear search / Close menus</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.shortcutKey}>Ctrl+N</span>
                  <span className={styles.shortcutAction}>New folder</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.shortcutKey}>Ctrl+,</span>
                  <span className={styles.shortcutAction}>Toggle theme</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.shortcutKey}>1</span>
                  <span className={styles.shortcutAction}>My Drive</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.shortcutKey}>2</span>
                  <span className={styles.shortcutAction}>Recent</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.shortcutKey}>3</span>
                  <span className={styles.shortcutAction}>Starred</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.shortcutKey}>4</span>
                  <span className={styles.shortcutAction}>Trash</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.shortcutKey}>g + v</span>
                  <span className={styles.shortcutAction}>Grid view</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.shortcutKey}>g + l</span>
                  <span className={styles.shortcutAction}>List view</span>
                </div>
              </div>
            )}
          </div>
          
          <button 
            className={styles.themeToggle}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          
          {/* Notifications */}
          <NotificationBell />

          {/* User Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className={styles.userDropdownTrigger}>
              <span className={styles.userEmail}>{user.email}</span>
              <span className={styles.dropdownArrow}>▼</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportAll}>
                <span className={styles.dropdownIcon}>📦</span>
                Export All
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <span className={styles.dropdownIcon}>🚪</span>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            {autoPinEnabled && storageStats.pinnedSize > 0 && (
              <p className={styles.autoPinCost}>
                💰 Estimated cost (1 year): {calculatePinningCost(storageStats.pinnedSize, 365)}
              </p>
            )}
          </div>

          <div className={styles.storageInfo}>
            <div className={styles.storageStats}>
              <div className={styles.storageHeader}>
                <h4 className={styles.storageTitle}>Storage Overview</h4>
                <div className={styles.storageActions}>
                  <button
                    className={styles.cleanupBtn}
                    onClick={() => setShowStorageCleanup(true)}
                    title="Storage cleanup tools"
                  >
                    🧹 Cleanup
                  </button>
                  <button
                    className={styles.gatewayBtn}
                    onClick={() => setShowGatewaySettings(true)}
                    title="Gateway/CDN settings"
                  >
                    ⚡ Gateways
                  </button>
                  <button
                    className={styles.twoFactorBtn}
                    onClick={() => setShowTwoFactorSetup(true)}
                    title="Two-factor authentication"
                  >
                    🔒 2FA
                  </button>
                </div>
              </div>
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
              {storageStats.pinnedSize > 0 && (
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>💰 Est. Cost:</span>
                  <span className={styles.statValue}>
                    {calculatePinningCost(storageStats.pinnedSize, 365)}/year
                  </span>
                </div>
              )}
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

          {/* Trash Auto-Delete Warning */}
          {activeView === 'trash' && (() => {
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            const trashedFiles = getTrashedItems();
            const expiredFiles = trashedFiles.filter(f => f.trashedDate && (now - f.trashedDate) >= thirtyDaysMs);
            const warningFiles = trashedFiles.filter(f => {
              if (!f.trashedDate) return false;
              const age = now - f.trashedDate;
              return age >= (thirtyDaysMs - sevenDaysMs) && age < thirtyDaysMs;
            });
            
            if (expiredFiles.length === 0 && warningFiles.length === 0) return null;
            
            return (
              <div className={styles.trashWarningBanner}>
                <div className={styles.trashWarningContent}>
                  <span className={styles.trashWarningIcon}>⚠️</span>
                  <div className={styles.trashWarningText}>
                    {expiredFiles.length > 0 && (
                      <strong>{expiredFiles.length} item{expiredFiles.length !== 1 ? 's' : ''} will be permanently deleted and unpinned automatically (older than 30 days)</strong>
                    )}
                    {expiredFiles.length > 0 && warningFiles.length > 0 && <span> • </span>}
                    {warningFiles.length > 0 && (() => {
                      const oldestWarningFile = warningFiles.reduce((oldest, f) => {
                        if (!oldest.trashedDate) return f;
                        if (!f.trashedDate) return oldest;
                        const age = now - f.trashedDate;
                        const oldestAge = now - oldest.trashedDate;
                        return age > oldestAge ? f : oldest;
                      }, warningFiles[0]);
                      const daysRemaining = oldestWarningFile.trashedDate 
                        ? Math.max(0, Math.ceil((thirtyDaysMs - (now - oldestWarningFile.trashedDate)) / (24 * 60 * 60 * 1000)))
                        : 0;
                      return (
                        <span>{warningFiles.length} item{warningFiles.length !== 1 ? 's' : ''} will be deleted in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</span>
                      );
                    })()}
                  </div>
                  {expiredFiles.length > 0 && (
                    <button
                      className={styles.cleanupTrashBtn}
                      onClick={async () => {
                        const result = await autoCleanupTrash();
                        if (result.deleted > 0 || result.unpinned > 0) {
                          showToast(`✅ ${result.deleted} item${result.deleted !== 1 ? 's' : ''} deleted${result.unpinned > 0 ? `, ${result.unpinned} unpinned` : ''}`, 'success');
                        }
                      }}
                    >
                      Clean Up Now
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

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
              {viewMode === 'list' && (
                <button
                  className={styles.columnSettingsBtn}
                  onClick={() => setShowColumnSettings(!showColumnSettings)}
                  title="Column settings"
                >
                  📊
                </button>
              )}
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
          {filesLoading ? (
            viewMode === 'grid' ? (
              <div className={styles.fileGrid}>
                <SkeletonLoader type="file-card" count={8} />
              </div>
            ) : (
              <div className={styles.fileList}>
                <SkeletonLoader type="file-row" count={10} />
              </div>
            )
          ) : filteredFiles.length === 0 ? (
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
          ) : viewMode === 'grid' ? (
            <div className={styles.fileGrid}>
              {filteredFiles.map((file) => {
                return (
                <div 
                  key={file.id} 
                  className={styles.fileCard}
                  onClick={() => file.isFolder ? handleFileClick(file) : null}
                  onDoubleClick={() => !file.isFolder ? handleFileClick(file) : null}
                  onMouseEnter={(e) => {
                    if (!file.isFolder && file.type?.startsWith('image/')) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoverPreviewPosition({
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                      setHoverPreviewFile(file);
                    }
                  }}
                  onMouseLeave={() => {
                    // Small delay to allow moving to preview
                    setTimeout(() => {
                      setHoverPreviewFile(null);
                    }, 100);
                  }}
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
                    {file.tags && file.tags.length > 0 && (
                      <div className={styles.fileTags}>
                        {file.tags.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className={styles.tagBadge} title={`Tag: ${tag}`}>
                            {tag}
                          </span>
                        ))}
                        {file.tags.length > 3 && (
                          <span className={styles.tagBadge} title={`${file.tags.length - 3} more tags`}>
                            +{file.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button 
                          className={styles.moreBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          title="More actions"
                        >
                          ⋮
                        </button>
                      </DropdownMenuTrigger>
                      
                      <DropdownMenuContent align="end">
                        {activeView !== 'trash' ? (
                          <>
                            {!file.isFolder && (
                              <>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePreview(file); }}>
                                  👁️ Preview
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShowDetails(file); }}>
                                  🧾 Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(file); }}>
                                  ⬇️ Download
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(file.gatewayUrl, '_blank'); }}>
                                  🔎 Open in new tab
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); copyToClipboard(file.gatewayUrl); }}>
                                  🔗 Copy Link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShare(file.id); }}>
                              🔗 Share
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(file.id); }}>
                              📋 Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleManageTags(file.id); }}>
                              🏷️ Manage Tags
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShowVersionHistory(file); }}>
                              📜 Version History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRename(file.id); }}>
                              ✏️ Rename
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }} className={styles.menuDanger}>
                              🗑️ Trash
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRestore(file.id); }}>
                              ↩️ Restore
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }} className={styles.menuDanger}>
                              ❌ Delete Forever
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.fileList}>
              {/* Column Headers */}
              <div className={styles.listHeader}>
                {visibleColumns.name && <div className={styles.listColumn} style={{ flex: '2' }}>Name</div>}
                {visibleColumns.size && <div className={styles.listColumn} style={{ flex: '1' }}>Size</div>}
                {visibleColumns.type && <div className={styles.listColumn} style={{ flex: '1' }}>Type</div>}
                {visibleColumns.modified && <div className={styles.listColumn} style={{ flex: '1' }}>Modified</div>}
                {visibleColumns.pinStatus && <div className={styles.listColumn} style={{ flex: '0.5' }}>Pin</div>}
                {visibleColumns.tags && <div className={styles.listColumn} style={{ flex: '1.5' }}>Tags</div>}
                {visibleColumns.starStatus && <div className={styles.listColumn} style={{ flex: '0.5' }}>⭐</div>}
                <div className={styles.listColumn} style={{ flex: '0.5' }}>Actions</div>
              </div>
              
              {/* File Rows */}
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className={styles.fileRow}
                  onClick={() => file.isFolder ? handleFileClick(file) : null}
                  onDoubleClick={() => !file.isFolder ? handleFileClick(file) : null}
                  data-folder-id={file.isFolder ? file.id : undefined}
                  data-file-id={!file.isFolder ? file.id : undefined}
                >
                  {/* Name Column */}
                  {visibleColumns.name && (
                    <div className={styles.listColumn} style={{ flex: '2' }}>
                      <div className={styles.fileIconSmall}>
                        {file.isFolder ? '📁' : getFileIcon(file.type)}
                      </div>
                      <span className={styles.fileNameList} title={file.name}>{file.name}</span>
                    </div>
                  )}
                  
                  {/* Size Column */}
                  {visibleColumns.size && (
                    <div className={styles.listColumn} style={{ flex: '1' }}>
                      {file.isFolder ? '—' : formatFileSize(file.size)}
                    </div>
                  )}
                  
                  {/* Type Column */}
                  {visibleColumns.type && (
                    <div className={styles.listColumn} style={{ flex: '1' }}>
                      {file.isFolder ? 'Folder' : file.type || 'unknown'}
                    </div>
                  )}
                  
                  {/* Modified Column */}
                  {visibleColumns.modified && (
                    <div className={styles.listColumn} style={{ flex: '1' }}>
                      {new Date(file.modifiedDate || file.timestamp).toLocaleDateString()}
                    </div>
                  )}
                  
                  {/* Pin Status Column */}
                  {visibleColumns.pinStatus && (
                    <div className={styles.listColumn} style={{ flex: '0.5' }}>
                      {!file.isFolder && (file.isPinned ? '📌' : '📍')}
                    </div>
                  )}
                  
                  {/* Tags Column */}
                  {visibleColumns.tags && (
                    <div className={styles.listColumn} style={{ flex: '1.5' }}>
                      {file.tags && file.tags.length > 0 ? (
                        <div className={styles.tagsListInline}>
                          {file.tags.slice(0, 2).map((tag, idx) => (
                            <span key={idx} className={styles.tagBadgeSmall}>{tag}</span>
                          ))}
                          {file.tags.length > 2 && <span className={styles.tagBadgeSmall}>+{file.tags.length - 2}</span>}
                        </div>
                      ) : '—'}
                    </div>
                  )}
                  
                  {/* Star Status Column */}
                  {visibleColumns.starStatus && (
                    <div className={styles.listColumn} style={{ flex: '0.5' }}>
                      {file.starred ? '⭐' : '☆'}
                    </div>
                  )}
                  
                  {/* Actions Column */}
                  <div className={styles.listColumn} style={{ flex: '0.5' }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button 
                          className={styles.moreBtn}
                          onClick={(e) => e.stopPropagation()}
                          title="More actions"
                        >
                          ⋮
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {activeView !== 'trash' ? (
                          <>
                            {!file.isFolder && (
                              <>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePreview(file); }}>
                                  👁️ Preview
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShowDetails(file); }}>
                                  🧾 Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(file); }}>
                                  ⬇️ Download
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShare(file.id); }}>
                              🔗 Share
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(file.id); }}>
                              📋 Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleManageTags(file.id); }}>
                              🏷️ Manage Tags
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShowVersionHistory(file); }}>
                              📜 Version History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRename(file.id); }}>
                              ✏️ Rename
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }} className={styles.menuDanger}>
                              🗑️ Trash
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRestore(file.id); }}>
                              ↩️ Restore
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }} className={styles.menuDanger}>
                              ❌ Delete Forever
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
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

      {/* Preview Modal */}
      {previewModalFile && (
        <PreviewModal
          isOpen={true}
          fileName={previewModalFile.name}
          fileType={previewModalFile.type}
          gatewayUrl={previewModalFile.gatewayUrl}
          onClose={() => setPreviewModalFile(null)}
        />
      )}

      {/* Column Settings Modal */}
      {showColumnSettings && (
        <ColumnSettings
          visibleColumns={visibleColumns}
          onToggleColumn={(column) => {
            setVisibleColumns(prev => ({
              ...prev,
              [column]: !prev[column as keyof typeof prev]
            }));
          }}
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {/* Tag Manager Modal */}
      {tagManagerFile && (
        <TagManager
          fileId={tagManagerFile.id}
          currentTags={tagManagerFile.tags || []}
          allTags={getAllTags()}
          onAddTag={(tag) => {
            handleAddTag(tagManagerFile.id, tag);
            // Update local state to reflect the change
            const index = uploadedFiles.findIndex(f => f.id === tagManagerFile.id);
            if (index !== -1) {
              const updatedFile = { ...tagManagerFile, tags: [...(tagManagerFile.tags || []), tag.toLowerCase()] };
              setTagManagerFile(updatedFile);
            }
          }}
          onRemoveTag={(tag) => {
            handleRemoveTag(tagManagerFile.id, tag);
            // Update local state to reflect the change
            const index = uploadedFiles.findIndex(f => f.id === tagManagerFile.id);
            if (index !== -1) {
              const updatedFile = { ...tagManagerFile, tags: (tagManagerFile.tags || []).filter(t => t.toLowerCase() !== tag.toLowerCase()) };
              setTagManagerFile(updatedFile);
            }
          }}
          onClose={() => setTagManagerFile(null)}
        />
      )}

      {/* Storage Cleanup Modal */}
      {showStorageCleanup && (
        <StorageCleanupModal
          isOpen={true}
          files={uploadedFiles}
          onClose={() => setShowStorageCleanup(false)}
          onDelete={(fileIds) => {
            // Delete selected files
            fileIds.forEach(fileId => {
              const index = uploadedFiles.findIndex(f => f.id === fileId);
              if (index !== -1) {
                permanentlyDelete(index);
              }
            });
            showToast(`✅ Deleted ${fileIds.length} file${fileIds.length !== 1 ? 's' : ''}`, 'success');
            setShowStorageCleanup(false);
          }}
        />
      )}

      {/* Hover Preview */}
      {hoverPreviewFile && (
        <FilePreviewHover
          file={hoverPreviewFile}
          position={hoverPreviewPosition}
          onClose={() => setHoverPreviewFile(null)}
        />
      )}

      {/* Details Panel */}
      {detailsPanelFile && (
        <FileDetailsPanel
          isOpen={true}
          file={detailsPanelFile as any}
          onClose={() => setDetailsPanelFile(null)}
          onDownload={() => handleDownload(detailsPanelFile)}
          onUpdateProperties={async (properties: Record<string, string>) => {
            const index = uploadedFiles.findIndex(f => f.id === detailsPanelFile.id);
            if (index !== -1) {
              const success = await updateCustomProperties(index, properties);
              if (success) {
                showToast('✅ Custom properties updated', 'success');
                // Update the details panel file
                const updatedFile = uploadedFiles[index];
                setDetailsPanelFile({ ...updatedFile });
              } else {
                const appError = ErrorHandler.createAppError(new Error('Failed to update custom properties'));
                showToast(appError.userMessage, 'error');
              }
            }
          }}
          onShare={() => handleShare(detailsPanelFile.id)}
          onTogglePin={() => handlePinToggle(detailsPanelFile.id, detailsPanelFile)}
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

      {/* Gateway Settings Modal */}
      <GatewaySettings
        isOpen={showGatewaySettings}
        onClose={() => setShowGatewaySettings(false)}
      />

      {/* Two-Factor Authentication Setup */}
      <TwoFactorSetup
        isOpen={showTwoFactorSetup}
        onClose={() => setShowTwoFactorSetup(false)}
        onEnabled={() => {
          showToast('✅ Two-factor authentication enabled!', 'success');
          setShowTwoFactorSetup(false);
        }}
      />

      {/* Version History Modal */}
      {versionHistoryFile && (
        <VersionHistory
          isOpen={true}
          fileId={versionHistoryFile.id}
          fileName={versionHistoryFile.name}
          onClose={() => setVersionHistoryFile(null)}
          onRestore={handleRestoreVersion}
        />
      )}

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

