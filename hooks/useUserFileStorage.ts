import { useStorageUpload } from '@thirdweb-dev/react';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  getPinningService, 
  initPinningService, 
  getPinningConfigFromEnv,
  PinStatus 
} from '../lib/pinningService';
import { ErrorHandler, ErrorType, AppError } from '../lib/errorHandler';
import { checkNewFileForDuplicates, getAllDuplicates, DuplicateMatch } from '../lib/duplicateDetection';

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
  // Tags/Labels
  tags?: string[];
  // Custom Properties/Metadata
  customProperties?: Record<string, string>;
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
  const [error, setError] = useState<AppError | null>(null);
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
        const appError = ErrorHandler.createAppError(error, ErrorType.IPFS);
        ErrorHandler.logError(appError, 'loadUserFiles');
        setError(appError);
        setUploadedFiles([]);
      } finally {
        setLoading(false);
      }
  };

  // Sync individual file metadata to Firestore
  const syncFilesToFirestore = async (files: UploadedFile[]) => {
    if (!userUid) return;

    try {
      // Firestore batches are limited to 500 operations
      const BATCH_SIZE = 500;
      
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const filesBatch = files.slice(i, i + BATCH_SIZE);
        
        for (const file of filesBatch) {
          const fileDocRef = doc(db, 'users', userUid, 'files', file.id);
          
          // Prepare file metadata for Firestore (omit IPFS-heavy data like activityLog)
          const fileMetadata = {
            id: file.id,
            name: file.name,
            ipfsUri: file.ipfsUri,
            gatewayUrl: file.gatewayUrl,
            timestamp: file.timestamp,
            type: file.type,
            size: file.size || null,
            isPinned: file.isPinned || false,
            pinService: file.pinService || null,
            pinDate: file.pinDate || null,
            pinExpiry: file.pinExpiry || null,
            parentFolderId: file.parentFolderId || null,
            isFolder: file.isFolder || false,
            starred: file.starred || false,
            trashed: file.trashed || false,
            trashedDate: file.trashedDate || null,
            lastAccessed: file.lastAccessed || null,
            modifiedDate: file.modifiedDate || file.timestamp,
            userId: userUid,
            lastSynced: Date.now()
          };

          batch.set(fileDocRef, fileMetadata, { merge: true });
        }
        
        // Commit batch before moving to next batch
        await batch.commit();
      }
      
      console.log('Synced', files.length, 'files to Firestore');
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.FIRESTORE);
      ErrorHandler.logError(appError, 'syncFilesToFirestore');
      // Don't throw - Firestore sync is optional enhancement
      // Don't set error state either - this is background sync
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
      
      // Sync individual file metadata to Firestore (enhancement)
      await syncFilesToFirestore(files);
      
      console.log('User file list saved to IPFS:', fileListUri[0]);
      console.log('IPFS Gateway URL:', fileListUri[0].replace('ipfs://', 'https://ipfs.io/ipfs/'));
      console.log('URI stored in Firestore');
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.FIRESTORE);
      ErrorHandler.logError(appError, 'saveUserFiles');
      setError(appError);
      throw appError; // Propagate error so caller knows save failed
    }
  };

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

      const appError = ErrorHandler.createAppError(result.error, ErrorType.PINNING);
      ErrorHandler.logError(appError, 'pinFile');
      setError(appError);
      return false;
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.PINNING);
      ErrorHandler.logError(appError, 'pinFile');
      setError(appError);
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

      const appError = ErrorHandler.createAppError(result.error, ErrorType.PINNING);
      ErrorHandler.logError(appError, 'unpinFile');
      setError(appError);
      return false;
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.PINNING);
      ErrorHandler.logError(appError, 'unpinFile');
      setError(appError);
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
    const file = uploadedFiles[index];
    if (!file) return false;

    // Unpin file before permanent deletion if it's pinned
    if (file.isPinned && !file.isFolder) {
      const pinningService = getPinningService();
      if (pinningService) {
        try {
          await pinningService.unpinFile(file.ipfsUri);
        } catch (error) {
          console.error('Failed to unpin file during permanent delete:', error);
        }
      }
    }

    const updatedFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(updatedFiles);
    await saveUserFiles(updatedFiles);
    return true;
  };

  // Auto-cleanup trash: unpin and delete files older than 30 days
  const autoCleanupTrash = async (): Promise<{ unpinned: number; deleted: number }> => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const trashedFiles = uploadedFiles.filter(f => f.trashed && f.trashedDate && f.trashedDate < thirtyDaysAgo);
    
    let unpinnedCount = 0;
    let deletedCount =  0;
    const updatedFiles = [...uploadedFiles];
    const pinningService = getPinningService();

    for (let i = updatedFiles.length - 1; i >= 0; i--) {
      const file = updatedFiles[i];
      if (!file.trashed || !file.trashedDate || file.trashedDate >= thirtyDaysAgo) continue;

      // Unpin if pinned (non-folders only)
      if (file.isPinned && !file.isFolder && pinningService) {
        try {
          await pinningService.unpinFile(file.ipfsUri);
          updatedFiles[i] = {
            ...file,
            isPinned: false,
            pinService: undefined,
            pinDate: undefined,
            pinExpiry: undefined,
            pinSize: undefined
          };
          unpinnedCount++;
        } catch (error) {
          console.error('Failed to unpin during auto-cleanup:', error);
        }
      }

      // Delete files older than 30 days
      updatedFiles.splice(i, 1);
      deletedCount++;
    }

    if (deletedCount > 0 || unpinnedCount > 0) {
      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
    }

    return { unpinned: unpinnedCount, deleted: deletedCount };
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

  // Add tags to a file
  const addTags = async (index: number, newTags: string[]): Promise<boolean> => {
    const file = uploadedFiles[index];
    if (!file) return false;

    try {
      // Normalize tags (lowercase, trim, remove duplicates)
      const normalizedTags = newTags
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)
        .filter((tag, idx, arr) => arr.indexOf(tag) === idx);

      const existingTags = file.tags || [];
      const tagSet = new Set([...existingTags, ...normalizedTags]);
      const updatedTags = Array.from(tagSet);

      const updatedFiles = [...uploadedFiles];
      updatedFiles[index] = {
        ...file,
        tags: updatedTags,
        modifiedDate: Date.now()
      };

      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      await addActivityLog(index, 'modified', `Added tags: ${normalizedTags.join(', ')}`);
      
      return true;
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.FIRESTORE);
      ErrorHandler.logError(appError, 'addTags');
      setError(appError);
      return false;
    }
  };

  // Remove tags from a file
  const removeTags = async (index: number, tagsToRemove: string[]): Promise<boolean> => {
    const file = uploadedFiles[index];
    if (!file) return false;

    try {
      const normalizedTags = tagsToRemove.map(tag => tag.toLowerCase());
      const existingTags = file.tags || [];
      const updatedTags = existingTags.filter(tag => !normalizedTags.includes(tag.toLowerCase()));

      const updatedFiles = [...uploadedFiles];
      updatedFiles[index] = {
        ...file,
        tags: updatedTags,
        modifiedDate: Date.now()
      };

      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      await addActivityLog(index, 'modified', `Removed tags: ${normalizedTags.join(', ')}`);
      
      return true;
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.FIRESTORE);
      ErrorHandler.logError(appError, 'removeTags');
      setError(appError);
      return false;
    }
  };

  // Set tags for a file (replace all tags)
  const setTags = async (index: number, tags: string[]): Promise<boolean> => {
    const file = uploadedFiles[index];
    if (!file) return false;

    try {
      // Normalize tags
      const normalizedTags = tags
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)
        .filter((tag, idx, arr) => arr.indexOf(tag) === idx);

      const updatedFiles = [...uploadedFiles];
      updatedFiles[index] = {
        ...file,
        tags: normalizedTags,
        modifiedDate: Date.now()
      };

      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      await addActivityLog(index, 'modified', `Set tags: ${normalizedTags.join(', ')}`);
      
      return true;
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.FIRESTORE);
      ErrorHandler.logError(appError, 'setTags');
      setError(appError);
      return false;
    }
  };

  // Get all unique tags from all files
  const getAllTags = (): string[] => {
    const allTags = new Set<string>();
    uploadedFiles.forEach(file => {
      if (file.tags && file.tags.length > 0 && !file.trashed) {
        file.tags.forEach(tag => allTags.add(tag));
      }
    });
    return Array.from(allTags).sort();
  };

  // Get files by tag
  const getFilesByTag = (tag: string): UploadedFile[] => {
    return uploadedFiles.filter(f => 
      !f.trashed && 
      f.tags && 
      f.tags.some(t => t.toLowerCase() === tag.toLowerCase())
    );
  };

  // Update custom properties for a file
  const updateCustomProperties = async (index: number, properties: Record<string, string>): Promise<boolean> => {
    const file = uploadedFiles[index];
    if (!file) return false;

    try {
      // Remove empty values
      const cleanedProperties: Record<string, string> = {};
      Object.entries(properties).forEach(([key, value]) => {
        if (key.trim() && value.trim()) {
          cleanedProperties[key.trim()] = value.trim();
        }
      });

      const updatedFiles = [...uploadedFiles];
      updatedFiles[index] = {
        ...file,
        customProperties: Object.keys(cleanedProperties).length > 0 ? cleanedProperties : undefined,
        modifiedDate: Date.now()
      };

      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      await addActivityLog(index, 'modified', `Updated custom properties`);
      
      return true;
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.FIRESTORE);
      ErrorHandler.logError(appError, 'updateCustomProperties');
      setError(appError);
      return false;
    }
  };

  // Set a single custom property
  const setCustomProperty = async (index: number, key: string, value: string): Promise<boolean> => {
    const file = uploadedFiles[index];
    if (!file) return false;

    const currentProperties = file.customProperties || {};
    const updatedProperties = { ...currentProperties };
    
    if (value.trim()) {
      updatedProperties[key.trim()] = value.trim();
    } else {
      delete updatedProperties[key.trim()];
    }

    return await updateCustomProperties(index, updatedProperties);
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
    error,
    clearError: () => setError(null),
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
    updateCustomProperties,
    setCustomProperty
  };
};