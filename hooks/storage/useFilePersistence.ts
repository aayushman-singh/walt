/**
 * File persistence layer
 *
 * Bridges IPFS (content / source of truth) and Firestore (fast index).
 * Owns the load/save cycle for the user's file list:
 *   - fetchFromIPFS:        resilient multi-gateway fetch
 *   - saveUserFiles:        write list to IPFS, store CID in Firestore
 *   - syncFilesToFirestore: optional per-file metadata index
 *   - loadUserFiles:        hydrate state from Firestore CID + backend merge
 *
 * Extracted from useUserFileStorage so the public entry hook stays a thin
 * composition layer. Behaviour is preserved verbatim from the original hook.
 *
 * The auto-pin coupling (loadUserFiles reads the persisted auto-pin preference
 * and must hand it to the pinning domain) is threaded through a ref so this hook
 * can be composed BEFORE usePinning (which itself needs saveUserFiles).
 */
import { MutableRefObject } from 'react';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ErrorHandler, ErrorType, AppError } from '../../lib/errorHandler';
import { getFileCache } from '../../lib/fileCache';
import { getGatewayOptimizer, getOptimizedGatewayUrl } from '../../lib/gatewayOptimizer';
import { BackendFileAPI } from '../../lib/backendClient';
import { UploadedFile, UserFileList } from './types';

interface UseFilePersistenceArgs {
  userUid: string | null;
  getAuthToken?: () => Promise<string | null>;
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<AppError | null>>;
  /** Ref to pinning.setAutoPinEnabledState, wired after pinning is composed. */
  setAutoPinEnabledRef: MutableRefObject<((enabled: boolean) => void) | null>;
}

export const useFilePersistence = ({
  userUid,
  getAuthToken,
  setUploadedFiles,
  setLoading,
  setError,
  setAutoPinEnabledRef,
}: UseFilePersistenceArgs) => {
  // Gateway optimizer for CDN integration
  const gatewayOptimizer = getGatewayOptimizer();

  // IPFS gateways to try (in order of preference) - fallback list
  // Prioritize user's own IPFS node first
  const customGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || process.env.IPFS_GATEWAY;
  const userGateway = customGateway
    ? (customGateway.endsWith('/') ? customGateway : `${customGateway}/`).replace(/\/ipfs\/?$/, '/ipfs/')
    : null;

  const IPFS_GATEWAYS = [
    ...(userGateway ? [userGateway] : []),
    'https://ipfs.io/ipfs/',
    'https://dweb.link/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
  ];

  /**
   * Fetch from IPFS with retry logic and optimized gateway selection
   *
   * Tries multiple gateways in order of performance (tracked by gatewayOptimizer).
   * Critical for resilience since public IPFS gateways are notoriously unreliable.
   * 8-second timeout prevents hanging on slow gateways.
   */
  const fetchFromIPFS = async (ipfsUri: string, maxRetries = 2): Promise<string | null> => {
    const ipfsHash = ipfsUri.replace('ipfs://', '');

    // Get ranked gateways (fastest first)
    const rankedGateways = gatewayOptimizer.getRankedGateways();
    const gatewaysToTry = rankedGateways.length > 0
      ? rankedGateways.map(g => g.url)
      : IPFS_GATEWAYS; // Fallback to default list

    for (let gatewayIndex = 0; gatewayIndex < gatewaysToTry.length; gatewayIndex++) {
      const gateway = gatewaysToTry[gatewayIndex];
      const gatewayUrl = `${gateway}${ipfsHash}`;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const startTime = Date.now();
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

          const response = await fetch(gatewayUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          const responseTime = Date.now() - startTime;

          if (response.ok) {
            const data = await response.text();
            // Record successful fetch for gateway optimization
            gatewayOptimizer.recordSuccess(gateway, responseTime);
            return data;
          }

          console.warn(`Gateway returned status ${response.status}`);
          gatewayOptimizer.recordFailure(gateway);

          // Don't retry if it's a 4xx error (won't be fixed by retry)
          if (response.status >= 400 && response.status < 500) {
            break;
          }
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          console.warn(`Failed: ${errorMsg}`);
          gatewayOptimizer.recordFailure(gateway);

          // Skip retries for DNS/network errors (won't be fixed by retrying)
          if (errorMsg.includes('NAME_NOT_RESOLVED') || errorMsg.includes('Failed to fetch')) {
            break;
          }

          // Wait before retry (only for transient errors)
          if (attempt < maxRetries - 1) {
            const delay = 1000 * (attempt + 1); // 1s, 2s
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    }

    return null;
  };

  /**
   * Sync individual file metadata to Firestore
   *
   * Firestore acts as a searchable index for file metadata. This is optional (app works
   * without it via IPFS alone), but dramatically improves search/filter performance.
   * Batching prevents hitting Firestore's 500-operation limit.
   */
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
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.FIRESTORE);
      ErrorHandler.logError(appError, 'syncFilesToFirestore');
      // Don't throw - Firestore sync is optional enhancement
      // Don't set error state either - this is background sync
    }
  };

  /**
   * Save user's file list to IPFS
   *
   * Creates a new IPFS object with the updated file list, then stores the new CID in
   * Firestore. This creates an immutable audit trail (old CIDs remain accessible) while
   * ensuring data can survive Firebase outages (IPFS is the source of truth).
   */
  const saveUserFiles = async (files: UploadedFile[]) => {
    if (!userUid) return;

    try {
      const userFileList: UserFileList = {
        files,
        lastUpdated: Date.now(),
        userId: userUid
      };

      // Upload the file list to IPFS using backend API
      const fileListJson = JSON.stringify(userFileList);
      const authToken = getAuthToken ? await getAuthToken() : null;
      if (!authToken) {
        throw new Error('Authentication required to save files');
      }
      try {
        const result = await BackendFileAPI.addToIPFS(fileListJson, authToken, false); // Don't pin file lists
        const fileListUri = result.ipfsUri;

        // Store the URI in Firestore (single source of truth)
        const userDocRef = doc(db, 'users', userUid);
        await setDoc(userDocRef, {
          fileListUri: fileListUri,
          lastUpdated: Date.now(),
          userId: userUid
        }, { merge: true });

        // Sync individual file metadata to Firestore (enhancement)
        await syncFilesToFirestore(files);
      } catch (uploadError: any) {
        // Better error handling for IPFS upload failures
        console.error('Failed to upload file list to IPFS:', uploadError);
        const errorMessage = uploadError?.message || uploadError?.error || 'Failed to upload file list to IPFS';
        throw new Error(`Failed to save files: ${errorMessage}`);
      }
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.FIRESTORE);
      ErrorHandler.logError(appError, 'saveUserFiles');
      setError(appError);
      throw appError; // Propagate error so caller knows save failed
    }
  };

  /**
   * Load user's file list from IPFS
   *
   * Firestore stores only the IPFS CID of the file list, not the list itself. This keeps
   * the actual data decentralized while using Firestore as a fast pointer. File list is
   * fetched from IPFS on every load to ensure we're always viewing the latest state.
   */
  const loadUserFiles = async () => {
    if (!userUid) return;

    setLoading(true);
    try {
      // Get IPFS URI from Firestore (single source of truth)
      const userDocRef = doc(db, 'users', userUid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        setUploadedFiles([]);
        return;
      }

      const userData = userDocSnap.data();
      if (typeof userData?.autoPinEnabled === 'boolean') {
        setAutoPinEnabledRef.current?.(userData.autoPinEnabled);
      }
      const userFileListUri = userData?.fileListUri || null;

      if (!userFileListUri) {
        // For new users without fileListUri, check backend database first
        // This fixes issue where uploaded files disappear after page refresh for new users
        try {
          if (getAuthToken) {
            const authToken = await getAuthToken();
            if (authToken) {
              try {
                const backendData = await BackendFileAPI.list(authToken).catch((err) => {
                  // If backend list fails, log but don't throw - this is non-critical
                  console.warn('Backend list failed for new user (non-critical):', err?.message || err);
                  return { files: [], folders: [] };
                });
                const backendFiles = backendData?.files || [];
                const backendFolders = backendData?.folders || [];

                // Convert backend files to UploadedFile format
                const filesFromBackend: UploadedFile[] = [];

                // Add files from backend
                for (const backendFile of backendFiles) {
                  filesFromBackend.push({
                    id: backendFile.id,
                    name: backendFile.filename || backendFile.original_filename,
                    ipfsUri: `ipfs://${backendFile.cid}`,
                    gatewayUrl: getOptimizedGatewayUrl(`ipfs://${backendFile.cid}`),
                    timestamp: new Date(backendFile.created_at).getTime(),
                    type: backendFile.mime_type || 'unknown',
                    size: backendFile.size,
                    isPinned: backendFile.is_pinned === 1,
                    pinService: backendFile.pin_service || undefined,
                    pinDate: backendFile.is_pinned ? new Date(backendFile.created_at).getTime() : undefined,
                    parentFolderId: backendFile.parent_folder_id || null,
                    modifiedDate: new Date(backendFile.updated_at || backendFile.created_at).getTime(),
                    isFolder: false
                  });
                }

                // Add folders from backend
                for (const backendFolder of backendFolders) {
                  filesFromBackend.push({
                    id: backendFolder.id,
                    name: backendFolder.name,
                    ipfsUri: '',
                    gatewayUrl: '',
                    timestamp: new Date(backendFolder.created_at).getTime(),
                    type: 'folder',
                    size: 0,
                    isPinned: false,
                    parentFolderId: backendFolder.parent_folder_id || null,
                    modifiedDate: new Date(backendFolder.updated_at || backendFolder.created_at).getTime(),
                    isFolder: true
                  });
                }

                if (filesFromBackend.length > 0) {
                  // Files exist in backend - create initial file list and save to IPFS
                  console.log(`Loading ${filesFromBackend.length} files from backend database for new user`);
                  setUploadedFiles(filesFromBackend);
                  await saveUserFiles(filesFromBackend);
                  return;
                }
              } catch (backendListError) {
                // Backend list failed - log but continue
                console.warn('Failed to load from backend for new user:', backendListError);
              }
            }
          }
        } catch (error) {
          // Auth token fetch or other error - log but continue
          console.warn('Backend check failed for new user (non-critical):', error);
        }

        // No files in backend either - truly empty
        setUploadedFiles([]);
        return;
      }

      // Load from IPFS with retry logic
      const fileListData = await fetchFromIPFS(userFileListUri);

      if (!fileListData) {
        console.error('Failed to fetch from all IPFS gateways after retries');
        setUploadedFiles([]);
        return;
      }

      const userFileList: UserFileList = JSON.parse(fileListData);

      // Verify this belongs to the current user
      if (userFileList.userId !== userUid) {
        console.error('User ID mismatch. Expected:', userUid, 'Got:', userFileList.userId);
        setUploadedFiles([]);
        return;
      }

      // Ensure all files have IDs (migration for old data)
      let filesWithIds = (userFileList.files || []).map(file => ({
        ...file,
        id: file.id || `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }));

      // Hybrid approach: Merge with backend database to catch any files that
      // were uploaded successfully but failed to save to IPFS file list
      // Note: Backend list is optional - if it fails, we still use IPFS data
      try {
        if (getAuthToken) {
          const authToken = await getAuthToken();
          if (authToken) {
            try {
              const backendData = await BackendFileAPI.list(authToken).catch((err) => {
                // If backend list fails, log but don't throw - this is non-critical
                console.warn('Backend list failed (non-critical):', err?.message || err);
                return { files: [], folders: [] };
              });
              const backendFiles = backendData?.files || [];
              const backendFolders = backendData?.folders || [];

              // Merge backend files with IPFS file list
              const ipfsFileIds = new Set(filesWithIds.map(f => f.id));
              const missingFiles: UploadedFile[] = [];

              // Add files from backend that aren't in IPFS list
              for (const backendFile of backendFiles) {
                if (!ipfsFileIds.has(backendFile.id)) {
                  missingFiles.push({
                    id: backendFile.id,
                    name: backendFile.filename || backendFile.original_filename,
                    ipfsUri: `ipfs://${backendFile.cid}`,
                    gatewayUrl: getOptimizedGatewayUrl(`ipfs://${backendFile.cid}`),
                    timestamp: new Date(backendFile.created_at).getTime(),
                    type: backendFile.mime_type || 'unknown',
                    size: backendFile.size,
                    isPinned: backendFile.is_pinned === 1,
                    pinService: backendFile.pin_service || undefined,
                    pinDate: backendFile.is_pinned ? new Date(backendFile.created_at).getTime() : undefined,
                    parentFolderId: backendFile.parent_folder_id || null,
                    modifiedDate: new Date(backendFile.updated_at || backendFile.created_at).getTime(),
                    isFolder: false
                  });
                }
              }

              // Add folders from backend that aren't in IPFS list
              for (const backendFolder of backendFolders) {
                if (!ipfsFileIds.has(backendFolder.id)) {
                  missingFiles.push({
                    id: backendFolder.id,
                    name: backendFolder.name,
                    ipfsUri: '',
                    gatewayUrl: '',
                    timestamp: new Date(backendFolder.created_at).getTime(),
                    type: 'folder',
                    size: 0,
                    isPinned: false,
                    parentFolderId: backendFolder.parent_folder_id || null,
                    modifiedDate: new Date(backendFolder.updated_at || backendFolder.created_at).getTime(),
                    isFolder: true
                  });
                }
              }

              if (missingFiles.length > 0) {
                console.log(`Syncing ${missingFiles.length} files from backend database that were missing from IPFS file list`);
                filesWithIds = [...filesWithIds, ...missingFiles];

                // Save the merged list back to IPFS (async, don't wait)
                saveUserFiles(filesWithIds).catch(err => {
                  console.error('Failed to save merged file list:', err);
                });
              }
            } catch (backendListError) {
              // Backend list failed - log but continue with IPFS data only
              console.warn('Failed to sync with backend database (non-critical):', backendListError);
            }
          }
        }
      } catch (backendError) {
        // Auth token fetch or other backend-related error - non-critical
        console.warn('Backend sync skipped (non-critical):', backendError);
      }

      setUploadedFiles(filesWithIds);

      // Cache frequently accessed files (recent and starred files)
      const fileCache = getFileCache();
      const recentlyAccessed = filesWithIds
        .filter(f => !f.trashed && f.lastAccessed)
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
        .slice(0, 20)
        .map(f => f.id);

      const starred = filesWithIds
        .filter(f => !f.trashed && f.starred)
        .map(f => f.id);

      const toCache = Array.from(new Set([...recentlyAccessed, ...starred]));
      fileCache.prefetch(toCache, filesWithIds);

      // If we had to add IDs, save the corrected data
      const hadMissingIds = filesWithIds.some((file, index) => !userFileList.files[index]?.id);
      if (hadMissingIds) {
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

  return { fetchFromIPFS, syncFilesToFirestore, saveUserFiles, loadUserFiles };
};
