/**
 * File views domain hook.
 *
 * Owns the sorting preferences and derives the various filtered/sorted views
 * (current folder, recent, starred, trashed) plus the starred toggle. Receives
 * shared file state, persistence, and the current folder id from the parent
 * composition hook.
 */

import { useState } from 'react';
import { UploadedFile, SortBy, SortDirection } from './types';

interface UseFileViewsParams {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  saveUserFiles: (files: UploadedFile[]) => Promise<void>;
  currentFolderId: string | null;
}

export const useFileViews = ({
  uploadedFiles,
  setUploadedFiles,
  saveUserFiles,
  currentFolderId,
}: UseFileViewsParams) => {
  const [sortBy, setSortByState] = useState<SortBy>('date');
  const [sortDirection, setSortDirectionState] = useState<SortDirection>('desc');
  const [sortEnabled, setSortEnabled] = useState(false); // Disable real-time sorting by default

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

  const setSortBy = (newSortBy: SortBy) => {
    setSortByState(newSortBy);
    setSortEnabled(true); // Enable sorting when user explicitly changes it
  };

  const setSortDirection = (newDirection: SortDirection) => {
    setSortDirectionState(newDirection);
    setSortEnabled(true); // Enable sorting when user explicitly changes it
  };

  return {
    getCurrentFolderItems,
    getRecentFiles,
    getStarredItems,
    getTrashedItems,
    toggleStarred,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    sortEnabled,
    setSortEnabled,
  };
};
