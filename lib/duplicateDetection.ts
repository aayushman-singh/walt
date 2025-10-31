import { UploadedFile } from '../hooks/useUserFileStorage';

export interface DuplicateMatch {
  file: UploadedFile;
  reason: 'content' | 'name-size' | 'name';
  matches: UploadedFile[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detect duplicate files based on IPFS URI (content)
 */
export function detectContentDuplicates(files: UploadedFile[]): DuplicateMatch[] {
  const contentMap = new Map<string, UploadedFile[]>();
  const duplicates: DuplicateMatch[] = [];

  // Group files by IPFS URI (same content)
  files.forEach(file => {
    if (!file.isFolder && file.ipfsUri) {
      if (!contentMap.has(file.ipfsUri)) {
        contentMap.set(file.ipfsUri, []);
      }
      contentMap.get(file.ipfsUri)!.push(file);
    }
  });

  // Find groups with more than one file
  contentMap.forEach((fileGroup, ipfsUri) => {
    if (fileGroup.length > 1) {
      fileGroup.forEach(file => {
        const matches = fileGroup.filter(f => f.id !== file.id);
        if (matches.length > 0) {
          duplicates.push({
            file,
            reason: 'content',
            matches,
            confidence: 'high'
          });
        }
      });
    }
  });

  return duplicates;
}

/**
 * Detect potential duplicates based on name and size
 */
export function detectNameSizeDuplicates(
  files: UploadedFile[], 
  folderId: string | null = null
): DuplicateMatch[] {
  const nameSizeMap = new Map<string, UploadedFile[]>();
  const duplicates: DuplicateMatch[] = [];

  // Filter files in the same folder (or root)
  const folderFiles = files.filter(f => 
    !f.isFolder && 
    !f.trashed && 
    f.parentFolderId === folderId
  );

  // Group by name + size + type
  folderFiles.forEach(file => {
    if (file.name && file.size !== undefined) {
      const key = `${file.name.toLowerCase()}_${file.size}_${file.type}`;
      if (!nameSizeMap.has(key)) {
        nameSizeMap.set(key, []);
      }
      nameSizeMap.get(key)!.push(file);
    }
  });

  // Find groups with more than one file
  nameSizeMap.forEach((fileGroup, key) => {
    if (fileGroup.length > 1) {
      fileGroup.forEach(file => {
        const matches = fileGroup.filter(f => f.id !== file.id);
        if (matches.length > 0) {
          // Check if same IPFS URI (definitely duplicate)
          const sameContent = matches.some(m => m.ipfsUri === file.ipfsUri);
          
          duplicates.push({
            file,
            reason: sameContent ? 'content' : 'name-size',
            matches,
            confidence: sameContent ? 'high' : 'medium'
          });
        }
      });
    }
  });

  return duplicates;
}

/**
 * Detect files with same name (potential duplicates)
 */
export function detectNameDuplicates(
  files: UploadedFile[],
  folderId: string | null = null
): DuplicateMatch[] {
  const nameMap = new Map<string, UploadedFile[]>();
  const duplicates: DuplicateMatch[] = [];

  const folderFiles = files.filter(f => 
    !f.isFolder && 
    !f.trashed && 
    f.parentFolderId === folderId
  );

  folderFiles.forEach(file => {
    if (file.name) {
      const key = file.name.toLowerCase();
      if (!nameMap.has(key)) {
        nameMap.set(key, []);
      }
      nameMap.get(key)!.push(file);
    }
  });

  nameMap.forEach((fileGroup, key) => {
    if (fileGroup.length > 1) {
      fileGroup.forEach(file => {
        const matches = fileGroup.filter(f => f.id !== file.id);
        if (matches.length > 0) {
          // Low confidence - just same name
          duplicates.push({
            file,
            reason: 'name',
            matches,
            confidence: 'low'
          });
        }
      });
    }
  });

  return duplicates;
}

/**
 * Get all duplicates for a file
 */
export function getAllDuplicates(
  files: UploadedFile[],
  targetFile: UploadedFile
): DuplicateMatch[] {
  const allDuplicates: DuplicateMatch[] = [];

  // Content duplicates (high confidence)
  const contentDupes = detectContentDuplicates(files);
  const contentMatch = contentDupes.find(d => d.file.id === targetFile.id);
  if (contentMatch) {
    allDuplicates.push(contentMatch);
    return allDuplicates; // High confidence, return early
  }

  // Name + size duplicates (medium confidence)
  const nameSizeDupes = detectNameSizeDuplicates(files, targetFile.parentFolderId);
  const nameSizeMatch = nameSizeDupes.find(d => d.file.id === targetFile.id);
  if (nameSizeMatch) {
    allDuplicates.push(nameSizeMatch);
    return allDuplicates;
  }

  // Name duplicates (low confidence)
  const nameDupes = detectNameDuplicates(files, targetFile.parentFolderId);
  const nameMatch = nameDupes.find(d => d.file.id === targetFile.id);
  if (nameMatch) {
    allDuplicates.push(nameMatch);
  }

  return allDuplicates;
}

/**
 * Check if a new file would be a duplicate
 */
export function checkNewFileForDuplicates(
  existingFiles: UploadedFile[],
  newFile: {
    name: string;
    size?: number;
    type: string;
    ipfsUri?: string;
    parentFolderId?: string | null;
  }
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  if (newFile.ipfsUri) {
    // Check for content duplicates
    const contentMatches = existingFiles.filter(f => 
      !f.isFolder && 
      !f.trashed && 
      f.ipfsUri === newFile.ipfsUri
    );
    
    if (contentMatches.length > 0) {
      matches.push({
        file: newFile as UploadedFile,
        reason: 'content',
        matches: contentMatches,
        confidence: 'high'
      });
      return matches; // High confidence match, return early
    }
  }

  // Check for name + size matches in same folder
  const nameSizeMatches = existingFiles.filter(f =>
    !f.isFolder &&
    !f.trashed &&
    f.parentFolderId === newFile.parentFolderId &&
    f.name.toLowerCase() === newFile.name.toLowerCase() &&
    f.size === newFile.size &&
    f.type === newFile.type
  );

  if (nameSizeMatches.length > 0) {
    matches.push({
      file: newFile as UploadedFile,
      reason: 'name-size',
      matches: nameSizeMatches,
      confidence: 'medium'
    });
  }

  // Check for name matches in same folder
  const nameMatches = existingFiles.filter(f =>
    !f.isFolder &&
    !f.trashed &&
    f.parentFolderId === newFile.parentFolderId &&
    f.name.toLowerCase() === newFile.name.toLowerCase()
  );

  if (nameMatches.length > 0 && matches.length === 0) {
    matches.push({
      file: newFile as UploadedFile,
      reason: 'name',
      matches: nameMatches,
      confidence: 'low'
    });
  }

  return matches;
}

