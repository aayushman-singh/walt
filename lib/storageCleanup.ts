import { UploadedFile } from '../hooks/useUserFileStorage';

export interface CleanupCandidate {
  file: UploadedFile;
  reason: 'large' | 'old' | 'old-unpinned' | 'type';
  size?: number;
  age?: number;
  details: string;
}

export interface CleanupFilters {
  minSizeMB?: number;
  maxAgeDays?: number;
  fileTypes?: string[];
  unpinnedOnly?: boolean;
}

/**
 * Find large files
 */
export function findLargeFiles(
  files: UploadedFile[],
  minSizeMB: number = 100
): CleanupCandidate[] {
  const minSizeBytes = minSizeMB * 1024 * 1024;
  const activeFiles = files.filter(f => !f.trashed && !f.isFolder);
  
  return activeFiles
    .filter(file => file.size && file.size >= minSizeBytes)
    .map(file => ({
      file,
      reason: 'large' as const,
      size: file.size,
      details: `${formatSize(file.size!)} (${formatSize(minSizeBytes)}+)`
    }))
    .sort((a, b) => (b.size || 0) - (a.size || 0));
}

/**
 * Find old files
 */
export function findOldFiles(
  files: UploadedFile[],
  maxAgeDays: number = 90
): CleanupCandidate[] {
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const cutoffDate = Date.now() - maxAgeMs;
  const activeFiles = files.filter(f => !f.trashed && !f.isFolder);
  
  return activeFiles
    .filter(file => {
      const fileDate = file.modifiedDate || file.timestamp || 0;
      return fileDate < cutoffDate;
    })
    .map(file => {
      const fileDate = file.modifiedDate || file.timestamp || 0;
      const ageDays = Math.floor((Date.now() - fileDate) / (24 * 60 * 60 * 1000));
      return {
        file,
        reason: 'old' as const,
        age: ageDays,
        details: `${ageDays} days old (modified ${new Date(fileDate).toLocaleDateString()})`
      };
    })
    .sort((a, b) => (b.age || 0) - (a.age || 0));
}

/**
 * Find old unpinned files
 */
export function findOldUnpinnedFiles(
  files: UploadedFile[],
  maxAgeDays: number = 30
): CleanupCandidate[] {
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const cutoffDate = Date.now() - maxAgeMs;
  const activeFiles = files.filter(f => !f.trashed && !f.isFolder && !f.isPinned);
  
  return activeFiles
    .filter(file => {
      const fileDate = file.modifiedDate || file.timestamp || 0;
      return fileDate < cutoffDate;
    })
    .map(file => {
      const fileDate = file.modifiedDate || file.timestamp || 0;
      const ageDays = Math.floor((Date.now() - fileDate) / (24 * 60 * 60 * 1000));
      return {
        file,
        reason: 'old-unpinned' as const,
        age: ageDays,
        size: file.size,
        details: `${ageDays} days old, unpinned, ${formatSize(file.size || 0)}`
      };
    })
    .sort((a, b) => (b.size || 0) - (a.size || 0));
}

/**
 * Find files by type
 */
export function findFilesByType(
  files: UploadedFile[],
  fileTypes: string[]
): CleanupCandidate[] {
  const activeFiles = files.filter(f => !f.trashed && !f.isFolder);
  
  return activeFiles
    .filter(file => {
      const fileType = file.type || '';
      return fileTypes.some(type => fileType.includes(type));
    })
    .map(file => ({
      file,
      reason: 'type' as const,
      size: file.size,
      details: `${file.type || 'unknown'} - ${formatSize(file.size || 0)}`
    }))
    .sort((a, b) => (b.size || 0) - (a.size || 0));
}

/**
 * Get storage breakdown by file type
 */
export function getStorageByType(files: UploadedFile[]): Map<string, { count: number; size: number }> {
  const activeFiles = files.filter(f => !f.trashed && !f.isFolder);
  const typeMap = new Map<string, { count: number; size: number }>();
  
  activeFiles.forEach(file => {
    const type = file.type || 'unknown';
    const category = getFileCategory(type);
    
    const existing = typeMap.get(category) || { count: 0, size: 0 };
    typeMap.set(category, {
      count: existing.count + 1,
      size: existing.size + (file.size || 0)
    });
  });
  
  return typeMap;
}

/**
 * Categorize file type
 */
function getFileCategory(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Images';
  if (mimeType.startsWith('video/')) return 'Videos';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType.includes('pdf')) return 'PDFs';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Documents';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Spreadsheets';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return 'Archives';
  return 'Other';
}

/**
 * Get all cleanup candidates based on filters
 */
export function getCleanupCandidates(
  files: UploadedFile[],
  filters: CleanupFilters
): CleanupCandidate[] {
  const candidates: CleanupCandidate[] = [];
  
  if (filters.minSizeMB) {
    candidates.push(...findLargeFiles(files, filters.minSizeMB));
  }
  
  if (filters.maxAgeDays) {
    if (filters.unpinnedOnly) {
      candidates.push(...findOldUnpinnedFiles(files, filters.maxAgeDays));
    } else {
      candidates.push(...findOldFiles(files, filters.maxAgeDays));
    }
  }
  
  if (filters.fileTypes && filters.fileTypes.length > 0) {
    candidates.push(...findFilesByType(files, filters.fileTypes));
  }
  
  // Remove duplicates (same file might match multiple criteria)
  const uniqueCandidates = new Map<string, CleanupCandidate>();
  candidates.forEach(candidate => {
    const existing = uniqueCandidates.get(candidate.file.id);
    if (!existing || (candidate.size || 0) > (existing.size || 0)) {
      uniqueCandidates.set(candidate.file.id, candidate);
    }
  });
  
  return Array.from(uniqueCandidates.values());
}

/**
 * Calculate total size of cleanup candidates
 */
export function calculateCleanupSize(candidates: CleanupCandidate[]): number {
  return candidates.reduce((total, candidate) => {
    return total + (candidate.file.size || 0);
  }, 0);
}

/**
 * Format file size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Get cleanup recommendations
 */
export function getCleanupRecommendations(files: UploadedFile[]): {
  largeFiles: number;
  oldFiles: number;
  oldUnpinnedFiles: number;
  totalSizeReclaimable: number;
  topCategories: Array<{ category: string; size: number; count: number }>;
} {
  const largeFiles = findLargeFiles(files, 100);
  const oldFiles = findOldFiles(files, 180); // 6 months
  const oldUnpinnedFiles = findOldUnpinnedFiles(files, 30);
  
  const allCandidates = [
    ...largeFiles,
    ...oldFiles,
    ...oldUnpinnedFiles
  ];
  
  const uniqueFiles = new Set(allCandidates.map(c => c.file.id));
  const totalSizeReclaimable = Array.from(uniqueFiles).reduce((total, fileId) => {
    const file = files.find(f => f.id === fileId);
    return total + (file?.size || 0);
  }, 0);
  
  const storageByType = getStorageByType(files);
  const topCategories = Array.from(storageByType.entries())
    .map(([category, data]) => ({
      category,
      size: data.size,
      count: data.count
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);
  
  return {
    largeFiles: largeFiles.length,
    oldFiles: oldFiles.length,
    oldUnpinnedFiles: oldUnpinnedFiles.length,
    totalSizeReclaimable,
    topCategories
  };
}

