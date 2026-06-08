/**
 * Pinning domain hook.
 *
 * Owns the auto-pin preference and pinning warning state, plus pin/unpin/expiry
 * operations and storage statistics. Receives shared file state and persistence
 * from the parent composition hook.
 */

import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  getPinningService,
  initPinningService,
  getPinningConfigFromEnv,
  getPinningServiceConfig,
} from '../../lib/pinningService';
import { ErrorHandler, ErrorType, AppError } from '../../lib/errorHandler';
import { UploadedFile } from './types';

interface UsePinningParams {
  userUid: string | null;
  getAuthToken?: () => Promise<string | null>;
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  saveUserFiles: (files: UploadedFile[]) => Promise<void>;
  setError: React.Dispatch<React.SetStateAction<AppError | null>>;
}

export const usePinning = ({
  userUid,
  getAuthToken,
  uploadedFiles,
  setUploadedFiles,
  saveUserFiles,
  setError,
}: UsePinningParams) => {
  const [autoPinEnabled, setAutoPinEnabledState] = useState(true); // Auto-pin by default
  const [pinningWarning, setPinningWarning] = useState<string | null>(null);

  // Initialize pinning service
  useEffect(() => {
    const config = getPinningConfigFromEnv();
    initPinningService(config);
    setPinningWarning(config.warning || null);
  }, []);

  const resolvePinningService = (suppressError = false) => {
    const service = getPinningService();
    if (!service) {
      if (!suppressError) {
        const appError = ErrorHandler.createAppError('Pinning service not initialized', ErrorType.PINNING);
        ErrorHandler.logError(appError, 'pinningService');
        setError(appError);
        setPinningWarning('Pinning service not initialized. Please refresh the page.');
      }
      return null;
    }

    const config = getPinningServiceConfig() || getPinningConfigFromEnv();
    if (config.service === 'local' && !config.fallback) {
      const warning = config.warning || 'Pinning service is not configured. Configure NEXT_PUBLIC_PINNING_SERVICE or backend pinning.';
      if (!suppressError) {
        const appError = ErrorHandler.createAppError(warning, ErrorType.PINNING);
        ErrorHandler.logError(appError, 'pinningService');
        setError(appError);
        setPinningWarning(warning);
      }
      return null;
    }

    if (!suppressError) {
      setPinningWarning(config.warning || null);
    }

    return service;
  };

  // Persist auto-pin preference to Firestore
  const persistAutoPinPreference = async (enabled: boolean) => {
    if (!userUid) return;

    try {
      const userDocRef = doc(db, 'users', userUid);
      await setDoc(userDocRef, {
        autoPinEnabled: enabled,
        userId: userUid,
        lastUpdated: Date.now()
      }, { merge: true });
    } catch (error) {
      const appError = ErrorHandler.createAppError(error, ErrorType.FIRESTORE);
      ErrorHandler.logError(appError, 'persistAutoPinPreference');
      setError(appError);
    }
  };

  // Pin a file
  const pinFile = async (index: number): Promise<boolean> => {
    const file = uploadedFiles[index];
    if (!file || file.isPinned) return false;

    const pinningService = resolvePinningService();
    if (!pinningService) {
      return false;
    }

    try {
      const authToken = getAuthToken ? await getAuthToken() : undefined;
      const result = await pinningService.pinByHash(file.ipfsUri, {
        name: file.name,
        keyvalues: {
          userId: userUid || 'unknown',
          fileType: file.type,
          timestamp: Date.now()
        }
      }, authToken || undefined);

      if (result.success) {
        const serviceConfig = getPinningServiceConfig();
        const serviceNameRaw = serviceConfig?.service || 'local';
        const serviceName = serviceNameRaw === 'backend' || serviceNameRaw === 'walt' ? 'walt' : serviceNameRaw;
        const updatedFiles = [...uploadedFiles];
        updatedFiles[index] = {
          ...file,
          isPinned: true,
          pinService: serviceName,
          pinDate: result.timestamp,
          pinSize: result.pinSize
        };
        setUploadedFiles(updatedFiles);

        // Save file list to IPFS in background - don't block or throw errors
        // The pin operation itself was successful
        saveUserFiles(updatedFiles).catch(err => {
          console.error('Failed to save file list metadata to IPFS:', err);
          // Don't throw - the pinning itself was successful
        });

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

    const pinningService = resolvePinningService();
    if (!pinningService) {
      return false;
    }

    try {
      const authToken = getAuthToken ? await getAuthToken() : undefined;
      const result = await pinningService.unpinFile(file.ipfsUri, authToken || undefined);

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

        // Save file list to IPFS in background - don't block or throw errors
        // The unpin operation itself was successful
        saveUserFiles(updatedFiles).catch(err => {
          console.error('Failed to save file list metadata to IPFS:', err);
          // Don't throw - the unpinning itself was successful
        });

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

  const setAutoPinEnabled = (enabled: boolean) => {
    setAutoPinEnabledState(enabled);
    persistAutoPinPreference(enabled);
  };

  return {
    autoPinEnabled,
    setAutoPinEnabledState,
    pinningWarning,
    resolvePinningService,
    pinFile,
    unpinFile,
    setPinExpiry,
    getStorageStats,
    setAutoPinEnabled,
  };
};
