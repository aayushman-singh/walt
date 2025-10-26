import { useStorageUpload } from '@thirdweb-dev/react';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface UploadedFile {
  name: string;
  ipfsUri: string;
  gatewayUrl: string;
  timestamp: number;
  type: string;
  size?: number;
}

interface UserFileList {
  files: UploadedFile[];
  lastUpdated: number;
  userId: string;
}

export const useUserFileStorage = (userUid: string | null) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const { mutateAsync: upload } = useStorageUpload();

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

      setUploadedFiles(userFileList.files || []);
      console.log('Successfully loaded', userFileList.files?.length || 0, 'files from IPFS');
      
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
  const addFiles = async (newFiles: UploadedFile[]) => {
    const updatedFiles = [...newFiles, ...uploadedFiles];
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
    refreshFiles: loadUserFiles
  };
};