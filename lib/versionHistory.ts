/**
 * Version History Management
 * Tracks file versions and enables restore functionality
 */

export interface FileVersion {
  fileId: string; // Original file ID
  versionId: string; // Unique version ID
  version: number; // Version number (1, 2, 3, ...)
  ipfsUri: string;
  gatewayUrl: string;
  timestamp: number;
  modifiedDate: number;
  size?: number;
  type: string;
  name: string;
  uploadedBy: string;
  changeDescription?: string; // Optional description of what changed
}

export interface VersionedFile {
  currentVersion: number;
  versions: FileVersion[];
}

/**
 * Create a new version entry for a file
 */
export function createFileVersion(
  fileId: string,
  ipfsUri: string,
  gatewayUrl: string,
  userId: string,
  fileData: {
    name: string;
    type: string;
    size?: number;
    modifiedDate?: number;
  },
  existingVersions: FileVersion[],
  changeDescription?: string
): FileVersion {
  // Get the next version number
  const existingVersionsForFile = existingVersions.filter(v => v.fileId === fileId);
  const nextVersion = existingVersionsForFile.length > 0 
    ? Math.max(...existingVersionsForFile.map(v => v.version)) + 1
    : 1;

  return {
    fileId,
    versionId: `version_${fileId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    version: nextVersion,
    ipfsUri,
    gatewayUrl,
    timestamp: Date.now(),
    modifiedDate: fileData.modifiedDate || Date.now(),
    size: fileData.size,
    type: fileData.type,
    name: fileData.name,
    uploadedBy: userId,
    changeDescription,
  };
}

/**
 * Get all versions for a file, sorted by newest first
 */
export function getFileVersions(
  versions: FileVersion[],
  fileId: string
): FileVersion[] {
  return versions
    .filter(v => v.fileId === fileId)
    .sort((a, b) => b.version - a.version); // Sort by version number, newest first
}

/**
 * Get a specific version of a file
 */
export function getFileVersion(
  versions: FileVersion[],
  fileId: string,
  versionNumber: number
): FileVersion | undefined {
  return versions.find(
    v => v.fileId === fileId && v.version === versionNumber
  );
}

/**
 * Get version by versionId
 */
export function getFileVersionById(
  versions: FileVersion[],
  versionId: string
): FileVersion | undefined {
  return versions.find(v => v.versionId === versionId);
}

/**
 * Get the latest version of a file
 */
export function getLatestVersion(
  versions: FileVersion[],
  fileId: string
): FileVersion | undefined {
  const fileVersions = getFileVersions(versions, fileId);
  return fileVersions.length > 0 ? fileVersions[0] : undefined;
}

/**
 * Format version timestamp for display
 */
export function formatVersionDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

