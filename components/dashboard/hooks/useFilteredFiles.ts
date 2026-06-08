/**
 * Derives the visible file list for the current view + search + filters.
 * Extracted verbatim from pages/dashboard.tsx (getViewFiles + the filter chain).
 * Pure derivation — not memoised, to match the original render-time computation.
 */

import { ActiveView, DashboardFilters, UploadedFile } from '../types';

interface UseFilteredFilesParams {
  uploadedFiles: UploadedFile[];
  searchTerm: string;
  activeView: ActiveView;
  filters: DashboardFilters;
  getRecentFiles: () => UploadedFile[];
  getStarredItems: () => UploadedFile[];
  getTrashedItems: () => UploadedFile[];
  getCurrentFolderItems: () => UploadedFile[];
}

export function useFilteredFiles({
  uploadedFiles,
  searchTerm,
  activeView,
  filters,
  getRecentFiles,
  getStarredItems,
  getTrashedItems,
  getCurrentFolderItems,
}: UseFilteredFilesParams): UploadedFile[] {
  // Get files based on active view
  const getViewFiles = () => {
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
        if (filters.fileType !== 'all') {
          return uploadedFiles.filter(f => !f.trashed);
        }
        return getCurrentFolderItems();
    }
  };

  const displayFiles = getViewFiles();

  // Apply search and filters
  return displayFiles.filter(file => {
    if (searchTerm && !file.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    if (filters.fileType !== 'all') {
      if (filters.fileType === 'folder' && !file.isFolder) return false;
      if (filters.fileType === 'image' && !file.type.startsWith('image/')) return false;
      if (filters.fileType === 'video' && !file.type.startsWith('video/')) return false;
      if (filters.fileType === 'audio' && !file.type.startsWith('audio/')) return false;
      if (filters.fileType === 'document' && !file.type.includes('pdf') && !file.type.includes('document') && !file.type.includes('text') && !file.type.includes('spreadsheet') && !file.type.includes('excel') && !file.type.includes('sheet')) return false;
      if (filters.fileType === 'other' && (file.isFolder || file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/'))) return false;
    }

    if (!file.isFolder && filters.pinStatus !== 'all') {
      if (filters.pinStatus === 'pinned' && !file.isPinned) return false;
      if (filters.pinStatus === 'unpinned' && file.isPinned) return false;
    }

    if (filters.starStatus !== 'all') {
      if (filters.starStatus === 'starred' && !file.starred) return false;
      if (filters.starStatus === 'unstarred' && file.starred) return false;
    }

    if (filters.tags.length > 0) {
      const fileTags = file.tags || [];
      const hasAllTags = filters.tags.every(filterTag =>
        fileTags.some(fileTag => fileTag.toLowerCase() === filterTag.toLowerCase())
      );
      if (!hasAllTags) return false;
    }

    if (!file.isFolder && file.size) {
      const sizeInMB = file.size / (1024 * 1024);
      if (filters.sizeMin && sizeInMB < parseFloat(filters.sizeMin)) return false;
      if (filters.sizeMax && sizeInMB > parseFloat(filters.sizeMax)) return false;
    }

    const fileDate = file.modifiedDate || file.timestamp;
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom).getTime();
      if (fileDate < fromDate) return false;
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo).getTime() + (24 * 60 * 60 * 1000);
      if (fileDate > toDate) return false;
    }

    return true;
  });
}
