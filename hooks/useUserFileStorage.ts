import { useStorageUpload } from '@thirdweb-dev/react';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  getPinningService, 
  initPinningService, 
  getPinningConfigFromEnv,
  PinStatus 
} from '../lib/pinningService';

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

interface ActivityLog {
  timestamp: number;
  action: 'created' | 'modified' | 'accessed' | 'shared' | 'unshared' | 'downloaded' | 'renamed' | 'starred' | 'unstarred' | 'trashed' | 'restored';
  userId?: string;
  userEmail?: string;
  details?: string;
}

interface UploadedFile {
  id: string; // Unique identifier
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
  parentFolderId?: string | null; // null = root
  isFolder?: boolean;
  starred?: boolean;
  trashed?: boolean;
  trashedDate?: number;
  lastAccessed?: number;
  modifiedDate?: number;
  // Sharing metadata (Phase 3)
  shareConfig?: ShareConfig;
  activityLog?: ActivityLog[];
}

// Helper type for cleaner code
type FileOrFolder = UploadedFile;

interface UserFileList {
  files: UploadedFile[];
  lastUpdated: number;
  userId: string;
}

export const useUserFileStorage = (userUid: string | null) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoPinEnabled, setAutoPinEnabled] = useState(true); // Auto-pin by default
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // null = root
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'type'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [sortEnabled, setSortEnabled] = useState(false); // Disable real-time sorting by default
  const { mutateAsync: upload } = useStorageUpload();

  // Initialize pinning service
  useEffect(() => {
    const config = getPinningConfigFromEnv();
    initPinningService(config);
  }, []);

  // IPFS gateways to try (in order of preference)
  const IPFS_GATEWAYS = [
    'https://ipfs.io/ipfs/',
    'https://dweb.link/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
  ];

  // Fetch from IPFS with retry logic and multiple gateways
  const fetchFromIPFS = async (ipfsUri: string, maxRetries = 2): Promise<string | null> => {
    const ipfsHash = ipfsUri.replace('ipfs://', '');
    
    for (let gatewayIndex = 0; gatewayIndex < IPFS_GATEWAYS.length; gatewayIndex++) {
      const gateway = IPFS_GATEWAYS[gatewayIndex];
      const gatewayUrl = `${gateway}${ipfsHash}`;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          console.log(`Fetching from gateway ${gatewayIndex + 1}/${IPFS_GATEWAYS.length} (attempt ${attempt + 1}/${maxRetries}):`, gatewayUrl);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout
          
          const response = await fetch(gatewayUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.text();
            console.log('✅ Successfully fetched from IPFS');
            return data;
          }
          
          console.warn(`Gateway returned status ${response.status}`);
          // Don't retry if it's a 4xx error (won't be fixed by retry)
          if (response.status >= 400 && response.status < 500) {
            break;
          }
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          console.warn(`Failed: ${errorMsg}`);
          
          // Skip retries for DNS/network errors (won't be fixed by retrying)
          if (errorMsg.includes('NAME_NOT_RESOLVED') || errorMsg.includes('Failed to fetch')) {
            console.log('Skipping retries (DNS/network error), trying next gateway...');
            break;
          }
          
          // Wait before retry (only for transient errors)
          if (attempt < maxRetries - 1) {
            const delay = 1000 * (attempt + 1); // 1s, 2s
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    }
    
    return null;
  };

  // Load user's file list from IPFS
  const loadUserFiles = async () => {
    if (!userUid) return;

    setLoading(true);
    try {
      console.log('Loading files for user:', userUid);
      
      // Get IPFS URI from Firestore (single source of truth)
      const userDocRef = doc(db, 'users', userUid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (!userDocSnap.exists()) {
        console.log('No user document found in Firestore');
        setUploadedFiles([]);
        return;
      }

      const userData = userDocSnap.data();
      const userFileListUri = userData?.fileListUri || null;
      
      if (!userFileListUri) {
        console.log('No IPFS URI found in Firestore');
        setUploadedFiles([]);
        return;
      }

      console.log('Found IPFS URI in Firestore:', userFileListUri);
      
      // Load from IPFS with retry logic
      const fileListData = await fetchFromIPFS(userFileListUri);
      
      if (!fileListData) {
        console.error('Failed to fetch from all IPFS gateways after retries');
        setUploadedFiles([]);
        return;
      }

      const userFileList: UserFileList = JSON.parse(fileListData);
      console.log('Loaded user file list from IPFS:', userFileList);
      
      // Verify this belongs to the current user
      if (userFileList.userId !== userUid) {
        console.error('User ID mismatch. Expected:', userUid, 'Got:', userFileList.userId);
        setUploadedFiles([]);
        return;
      }

      // Ensure all files have IDs (migration for old data)
      const filesWithIds = (userFileList.files || []).map(file => ({
        ...file,
        id: file.id || `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }));
      
      setUploadedFiles(filesWithIds);
      console.log('Successfully loaded', filesWithIds.length, 'files from IPFS');
      
      // If we had to add IDs, save the corrected data
      const hadMissingIds = filesWithIds.some((file, index) => !userFileList.files[index]?.id);
      if (hadMissingIds) {
        console.log('Some files were missing IDs, saving corrected data...');
        await saveUserFiles(filesWithIds);
      }
      
    } catch (error) {
      console.error('Failed to load user files:', error);
      setUploadedFiles([]);
    } finally {
      setLoading(false);
    }
  };

  // Save user's file list to IPFS
  const saveUserFiles = async (files: UploadedFile[]) => {
    if (!userUid) return;

    try {
      console.log('Saving', files.length, 'files to IPFS for user:', userUid);
      
      const userFileList: UserFileList = {
        files,
        lastUpdated: Date.now(),
        userId: userUid
      };

      // Upload the file list to IPFS
      const fileListUri = await upload({ data: [JSON.stringify(userFileList)] });
      
      console.log('IPFS upload successful:', fileListUri[0]);
      
      // Store the URI in Firestore (single source of truth)
      const userDocRef = doc(db, 'users', userUid);
      await setDoc(userDocRef, {
        fileListUri: fileListUri[0],
        lastUpdated: Date.now(),
        userId: userUid
      }, { merge: true });
      
      console.log('User file list saved to IPFS:', fileListUri[0]);
      console.log('IPFS Gateway URL:', fileListUri[0].replace('ipfs://', 'https://ipfs.io/ipfs/'));
      console.log('URI stored in Firestore');
    } catch (error) {
      console.error('Failed to save user files:', error);
      throw error; // Propagate error so caller knows save failed
    }
  };

  // Add new files
  const addFiles = async (newFiles: UploadedFile[], parentFolderId: string | null = null) => {
    // Ensure all files have IDs and correct parent
    const filesWithIds = newFiles.map(file => ({
      ...file,
      id: file.id || `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      parentFolderId: parentFolderId !== undefined ? parentFolderId : currentFolderId,
      modifiedDate: file.modifiedDate || Date.now()
    }));
    
    const updatedFiles = [...filesWithIds, ...uploadedFiles];
    setUploadedFiles(updatedFiles);
    await saveUserFiles(updatedFiles);
  };

  // Remove a file
  const removeFile = async (index: number) => {
    const updatedFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(updatedFiles);
    await saveUserFiles(updatedFiles);
  };

  // Clear all files
  const clearAllFiles = async () => {
    setUploadedFiles([]);
    await saveUserFiles([]);
  };

  // Pin a file
  const pinFile = async (index: number): Promise<boolean> => {
    const file = uploadedFiles[index];
    if (!file || file.isPinned) return false;

    const pinningService = getPinningService();
    if (!pinningService) {
      console.warn('Pinning service not configured');
      return false;
    }

    try {
      const result = await pinningService.pinByHash(file.ipfsUri, {
        name: file.name,
        keyvalues: {
          userId: userUid || 'unknown',
          fileType: file.type,
          timestamp: Date.now()
        }
      });

      if (result.success) {
        const updatedFiles = [...uploadedFiles];
        updatedFiles[index] = {
          ...file,
          isPinned: true,
          pinService: 'pinata',
          pinDate: result.timestamp,
          pinSize: result.pinSize
        };
        setUploadedFiles(updatedFiles);
        await saveUserFiles(updatedFiles);
        return true;
      }

      console.error('Pin failed:', result.error);
      return false;
    } catch (error) {
      console.error('Pin error:', error);
      return false;
    }
  };

  // Unpin a file
  const unpinFile = async (index: number): Promise<boolean> => {
    const file = uploadedFiles[index];
    if (!file || !file.isPinned) return false;

    const pinningService = getPinningService();
    if (!pinningService) {
      console.warn('Pinning service not configured');
      return false;
    }

    try {
      const result = await pinningService.unpinFile(file.ipfsUri);

      if (result.success) {
        const updatedFiles = [...uploadedFiles];
        updatedFiles[index] = {
          ...file,
          isPinned: false,
          pinService: undefined,
          pinDate: undefined,
          pinExpiry: undefined,
          pinSize: undefined
        };
        setUploadedFiles(updatedFiles);
        await saveUserFiles(updatedFiles);
        return true;
      }

      console.error('Unpin failed:', result.error);
      return false;
    } catch (error) {
      console.error('Unpin error:', error);
      return false;
    }
  };

  // Set pin expiry
  const setPinExpiry = async (index: number, expiryDate: number): Promise<boolean> => {
    const file = uploadedFiles[index];
    if (!file) return false;

    const updatedFiles = [...uploadedFiles];
    updatedFiles[index] = {
      ...file,
      pinExpiry: expiryDate
    };
    setUploadedFiles(updatedFiles);
    await saveUserFiles(updatedFiles);
    return true;
  };

  // Get storage statistics
  const getStorageStats = () => {
    const activeFiles = uploadedFiles.filter(f => !f.trashed && !f.isFolder);
    const totalSize = activeFiles.reduce((acc, file) => acc + (file.size || 0), 0);
    const pinnedSize = activeFiles
      .filter(f => f.isPinned)
      .reduce((acc, file) => acc + (file.size || 0), 0);
    const unpinnedSize = totalSize - pinnedSize;
    const pinnedCount = activeFiles.filter(f => f.isPinned).length;
    const unpinnedCount = activeFiles.length - pinnedCount;

    return {
      totalFiles: activeFiles.length,
      totalSize,
      pinnedCount,
      pinnedSize,
      unpinnedCount,
      unpinnedSize
    };
  };

  // Create a new folder
  const createFolder = async (folderName: string, parentId: string | null = null): Promise<boolean> => {
    try {
      const newFolder: UploadedFile = {
        id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: folderName,
        ipfsUri: '',
        gatewayUrl: '',
        timestamp: Date.now(),
        type: 'folder',
        isFolder: true,
        parentFolderId: parentId,
        isPinned: true, // Folders are always "pinned" (metadata only)
        modifiedDate: Date.now()
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
    await saveUserFiles(updatedFiles);
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
    await saveUserFiles(updatedFiles);
    return true;
  };

  // Toggle starred status
  const toggleStarred = async (index: number): Promise<boolean> => {
    const updatedFiles = [...uploadedFiles];
    updatedFiles[index] = {
      ...updatedFiles[index],
      starred: !updatedFiles[index].starred
      // Don't update modifiedDate to prevent sorting
    };
    setUploadedFiles(updatedFiles);
    // Don't save immediately to prevent instant sorting - save in background
    saveUserFiles(updatedFiles).catch(console.error);
    return true;
  };

  // Move to trash (soft delete)
  const moveToTrash = async (index: number): Promise<boolean> => {
    const updatedFiles = [...uploadedFiles];
    updatedFiles[index] = {
      ...updatedFiles[index],
      trashed: true,
      trashedDate: Date.now(),
      modifiedDate: Date.now()
    };
    setUploadedFiles(updatedFiles);
    await saveUserFiles(updatedFiles);
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
    await saveUserFiles(updatedFiles);
    return true;
  };

  // Permanently delete
  const permanentlyDelete = async (index: number): Promise<boolean> => {
    const updatedFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(updatedFiles);
    await saveUserFiles(updatedFiles);
    return true;
  };

  // Update last accessed time
  const updateLastAccessed = async (index: number) => {
    const updatedFiles = [...uploadedFiles];
    updatedFiles[index] = {
      ...updatedFiles[index],
      lastAccessed: Date.now()
    };
    setUploadedFiles(updatedFiles);
    // Don't await - background update
    saveUserFiles(updatedFiles).catch(console.error);
  };

  // Get files in current folder
  const getCurrentFolderItems = () => {
    return uploadedFiles
      .filter(f => {
        // If we're in root folder (currentFolderId is null), show only files with no parent
        if (currentFolderId === null) {
          return !f.trashed && (!f.parentFolderId || f.parentFolderId === null);
        }
        // Otherwise, show files in the specific folder
        return !f.trashed && f.parentFolderId === currentFolderId;
      })
      .sort((a, b) => {
        let comparison = 0;
        
        // Folders first
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        
        // Starred items second (leftmost)
        if (a.starred && !b.starred) return -1;
        if (!a.starred && b.starred) return 1;
        
        // Only apply custom sorting if enabled
        if (sortEnabled) {
          switch (sortBy) {
            case 'name':
              comparison = a.name.localeCompare(b.name);
              break;
            case 'date':
              comparison = (b.modifiedDate || b.timestamp) - (a.modifiedDate || a.timestamp);
              break;
            case 'size':
              comparison = (b.size || 0) - (a.size || 0);
              break;
            case 'type':
              comparison = (a.type || '').localeCompare(b.type || '');
              break;
          }
          
          return sortDirection === 'asc' ? comparison : -comparison;
        }
        
        // Default: sort by upload order (timestamp)
        return b.timestamp - a.timestamp;
      });
  };

  // Get recent files (last 20, accessed in last 30 days)
  const getRecentFiles = () => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    return uploadedFiles
      .filter(f => !f.trashed && !f.isFolder && (f.lastAccessed || f.timestamp) > thirtyDaysAgo)
      .sort((a, b) => (b.lastAccessed || b.timestamp) - (a.lastAccessed || a.timestamp))
      .slice(0, 20);
  };

  // Get starred items
  const getStarredItems = () => {
    return uploadedFiles
      .filter(f => !f.trashed && f.starred)
      .sort((a, b) => (b.modifiedDate || b.timestamp) - (a.modifiedDate || a.timestamp));
  };

  // Get trashed items
  const getTrashedItems = () => {
    return uploadedFiles
      .filter(f => f.trashed)
      .sort((a, b) => (b.trashedDate || b.timestamp) - (a.trashedDate || a.timestamp));
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

  // Add activity log entry
  const addActivityLog = async (index: number, action: ActivityLog['action'], details?: string) => {
    const updatedFiles = [...uploadedFiles];
    const file = updatedFiles[index];
    
    const logEntry: ActivityLog = {
      timestamp: Date.now(),
      action,
      userId: userUid || undefined,
      details
    };

    file.activityLog = [logEntry, ...(file.activityLog || [])].slice(0, 50); // Keep last 50 entries
    
    setUploadedFiles(updatedFiles);
    // Background save - don't await
    saveUserFiles(updatedFiles).catch(console.error);
  };

  // Enable sharing for a file/folder
  const enableSharing = async (
    index: number, 
    permission: 'viewer' | 'editor' = 'viewer',
    expiryDate?: number,
    password?: string
  ): Promise<string | null> => {
    const file = uploadedFiles[index];
    if (!file) return null;

    const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const shareConfig: ShareConfig = {
      shareId,
      enabled: true,
      createdDate: Date.now(),
      createdBy: userUid || 'unknown',
      permission,
      expiryDate,
      password,
      accessCount: 0
    };

    const updatedFiles = [...uploadedFiles];
    updatedFiles[index] = {
      ...file,
      shareConfig,
      modifiedDate: Date.now()
    };

    setUploadedFiles(updatedFiles);
    await saveUserFiles(updatedFiles);
    await addActivityLog(index, 'shared', `Shared with ${permission} permission`);

    return shareId;
  };

  // Disable sharing
  const disableSharing = async (index: number): Promise<boolean> => {
    const updatedFiles = [...uploadedFiles];
    const file = updatedFiles[index];
    
    if (file.shareConfig) {
      file.shareConfig = {
        ...file.shareConfig,
        enabled: false
      };
      file.modifiedDate = Date.now();
    }

    setUploadedFiles(updatedFiles);
    await saveUserFiles(updatedFiles);
    await addActivityLog(index, 'unshared');
    return true;
  };

  // Update share config
  const updateShareConfig = async (
    index: number,
    updates: Partial<ShareConfig>
  ): Promise<boolean> => {
    const updatedFiles = [...uploadedFiles];
    const file = updatedFiles[index];
    
    if (file.shareConfig) {
      file.shareConfig = {
        ...file.shareConfig,
        ...updates
      };
      file.modifiedDate = Date.now();
      
      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      return true;
    }
    
    return false;
  };

  // Get file by share ID (for public access)
  const getFileByShareId = (shareId: string): UploadedFile | null => {
    return uploadedFiles.find(f => 
      f.shareConfig?.shareId === shareId && 
      f.shareConfig?.enabled === true &&
      !f.trashed
    ) || null;
  };

  // Record share access
  const recordShareAccess = async (shareId: string) => {
    const index = uploadedFiles.findIndex(f => f.shareConfig?.shareId === shareId);
    if (index === -1) return;

    const updatedFiles = [...uploadedFiles];
    const file = updatedFiles[index];
    
    if (file.shareConfig) {
      file.shareConfig = {
        ...file.shareConfig,
        accessCount: (file.shareConfig.accessCount || 0) + 1,
        lastAccessedDate: Date.now()
      };
      
      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      await addActivityLog(index, 'accessed', 'Accessed via share link');
    }
  };

  // Get all shared files
  const getSharedFiles = (): UploadedFile[] => {
    return uploadedFiles.filter(f => 
      f.shareConfig?.enabled && !f.trashed
    );
  };

  // Load files when user changes
  useEffect(() => {
    if (userUid) {
      loadUserFiles();
    } else {
      setUploadedFiles([]);
    }
  }, [userUid]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    uploadedFiles,
    loading,
    addFiles,
    removeFile,
    clearAllFiles,
    refreshFiles: loadUserFiles,
    // Pinning functions
    pinFile,
    unpinFile,
    setPinExpiry,
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
    setSortBy: (newSortBy: 'name' | 'date' | 'size' | 'type') => {
      setSortBy(newSortBy);
      setSortEnabled(true); // Enable sorting when user explicitly changes it
    },
    sortDirection,
    setSortDirection: (newDirection: 'asc' | 'desc') => {
      setSortDirection(newDirection);
      setSortEnabled(true); // Enable sorting when user explicitly changes it
    },
    sortEnabled,
    setSortEnabled,
    // Sharing functions (Phase 3)
    enableSharing,
    disableSharing,
    updateShareConfig,
    getFileByShareId,
    recordShareAccess,
    getSharedFiles,
    addActivityLog
  };
};