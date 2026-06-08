/**
 * Tags domain hook.
 *
 * Add/remove/set tags on files and tag-based queries. Receives shared file
 * state, persistence, the activity logger, and the error setter from the parent
 * composition hook.
 */

import { ErrorHandler, ErrorType, AppError } from '../../lib/errorHandler';
import { UploadedFile, ActivityLog } from './types';

interface UseTagsParams {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  saveUserFiles: (files: UploadedFile[]) => Promise<void>;
  addActivityLog: (index: number, action: ActivityLog['action'], details?: string) => Promise<void>;
  setError: React.Dispatch<React.SetStateAction<AppError | null>>;
}

export const useTags = ({
  uploadedFiles,
  setUploadedFiles,
  saveUserFiles,
  addActivityLog,
  setError,
}: UseTagsParams) => {
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

  return {
    addTags,
    removeTags,
    setTags,
    getAllTags,
    getFilesByTag,
  };
};
