/**
 * Custom properties domain hook.
 *
 * Update / set individual custom key-value metadata on files. Receives shared
 * file state, persistence, the activity logger, and the error setter from the
 * parent composition hook.
 */

import { ErrorHandler, ErrorType, AppError } from '../../lib/errorHandler';
import { UploadedFile, ActivityLog } from './types';

interface UseCustomPropertiesParams {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  saveUserFiles: (files: UploadedFile[]) => Promise<void>;
  addActivityLog: (index: number, action: ActivityLog['action'], details?: string) => Promise<void>;
  setError: React.Dispatch<React.SetStateAction<AppError | null>>;
}

export const useCustomProperties = ({
  uploadedFiles,
  setUploadedFiles,
  saveUserFiles,
  addActivityLog,
  setError,
}: UseCustomPropertiesParams) => {
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

  return {
    updateCustomProperties,
    setCustomProperty,
  };
};
