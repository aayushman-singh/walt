/**
 * Sharing domain hook.
 *
 * Enable/disable/update share configs, public share lookup, access recording,
 * and listing shared files. Receives shared file state, persistence, and the
 * activity logger from the parent composition hook.
 */

import { UploadedFile, ShareConfig } from './types';

interface UseSharingParams {
  userUid: string | null;
  getAuthToken?: () => Promise<string | null>;
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  saveUserFiles: (files: UploadedFile[]) => Promise<void>;
  addActivityLog: (index: number, action: import('./types').ActivityLog['action'], details?: string) => Promise<void>;
}

export const useSharing = ({
  userUid,
  getAuthToken,
  uploadedFiles,
  setUploadedFiles,
  saveUserFiles,
  addActivityLog,
}: UseSharingParams) => {
  /**
   * Enable sharing for a file/folder
   *
   * Sharing in a decentralized system is complex: we need a centralized index for short
   * URLs and access control, but the content itself must remain decentralized. Backend
   * creates the share record and short link, falling back to local-only sharing if offline.
   */
  const enableSharing = async (
    index: number,
    permission: 'viewer' | 'editor' = 'viewer',
    expiryDate?: number,
    password?: string
  ): Promise<string | null> => {
    const file = uploadedFiles[index];
    if (!file) return null;

    try {
      // Get auth token
      const token = getAuthToken ? await getAuthToken() : null;
      if (!token) {
        console.error('No auth token available for sharing');
        return null;
      }

      // Call backend API to create share (which auto-generates short link)
      const { BackendShareAPI } = await import('../../lib/backendClient');
      const shareResponse = await BackendShareAPI.create(
        file.id,
        {
          permissionLevel: permission,
          expiresAt: expiryDate ? new Date(expiryDate).toISOString() : null,
          password: password || null,
        },
        token
      );

      const shareConfig: ShareConfig = {
        shareId: shareResponse.shareId,
        enabled: true,
        createdDate: Date.now(),
        createdBy: userUid || 'unknown',
        permission,
        expiryDate,
        password,
        accessCount: 0,
        shortCode: shareResponse.shortCode,
        shortUrl: shareResponse.shortUrl,
      };

      const updatedFiles = [...uploadedFiles];
      updatedFiles[index] = {
        ...file,
        shareConfig,
        modifiedDate: Date.now()
      };

      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      await addActivityLog(index, 'shared', `Shared with ${permission} permission`);

      return shareResponse.shareId;
    } catch (error) {
      console.error('Failed to create share:', error);
      // Fallback to local-only share if backend fails
      const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const shareConfig: ShareConfig = {
        shareId,
        enabled: true,
        createdDate: Date.now(),
        createdBy: userUid || 'unknown',
        permission,
        expiryDate,
        password,
        accessCount: 0
      };

      const updatedFiles = [...uploadedFiles];
      updatedFiles[index] = {
        ...file,
        shareConfig,
        modifiedDate: Date.now()
      };

      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);

      return shareId;
    }
  };

  // Disable sharing
  const disableSharing = async (index: number): Promise<boolean> => {
    const updatedFiles = [...uploadedFiles];
    const file = updatedFiles[index];

    if (file.shareConfig) {
      file.shareConfig = {
        ...file.shareConfig,
        enabled: false
      };
      file.modifiedDate = Date.now();
    }

    setUploadedFiles(updatedFiles);
    await saveUserFiles(updatedFiles);
    await addActivityLog(index, 'unshared');
    return true;
  };

  // Update share config
  const updateShareConfig = async (
    index: number,
    updates: Partial<ShareConfig>
  ): Promise<boolean> => {
    const updatedFiles = [...uploadedFiles];
    const file = updatedFiles[index];

    if (file.shareConfig) {
      file.shareConfig = {
        ...file.shareConfig,
        ...updates
      };
      file.modifiedDate = Date.now();

      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      return true;
    }

    return false;
  };

  // Get file by share ID (for public access)
  const getFileByShareId = (shareId: string): UploadedFile | null => {
    return uploadedFiles.find(f =>
      f.shareConfig?.shareId === shareId &&
      f.shareConfig?.enabled === true &&
      !f.trashed
    ) || null;
  };

  // Record share access
  const recordShareAccess = async (shareId: string) => {
    const index = uploadedFiles.findIndex(f => f.shareConfig?.shareId === shareId);
    if (index === -1) return;

    const updatedFiles = [...uploadedFiles];
    const file = updatedFiles[index];

    if (file.shareConfig) {
      file.shareConfig = {
        ...file.shareConfig,
        accessCount: (file.shareConfig.accessCount || 0) + 1,
        lastAccessedDate: Date.now()
      };

      setUploadedFiles(updatedFiles);
      await saveUserFiles(updatedFiles);
      await addActivityLog(index, 'accessed', 'Accessed via share link');
    }
  };

  // Get all shared files
  const getSharedFiles = (): UploadedFile[] => {
    return uploadedFiles.filter(f =>
      f.shareConfig?.enabled && !f.trashed
    );
  };

  return {
    enableSharing,
    disableSharing,
    updateShareConfig,
    getFileByShareId,
    recordShareAccess,
    getSharedFiles,
  };
};
