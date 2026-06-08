/**
 * Sharing and tagging handlers plus the share-modal and tag-manager trigger
 * state. Extracted verbatim from pages/dashboard.tsx.
 */

import { useState } from 'react';
import { ErrorHandler } from '../../../lib/errorHandler';
import { UploadedFile } from '../types';
import { useEncryptedShare, type SharedRecord } from './useEncryptedShare';
import type { EncryptedRecipient } from '../../ShareModal';

interface UseShareTagsParams {
  uploadedFiles: UploadedFile[];
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
  enableSharing: (index: number, permission: 'viewer' | 'editor', expiryDate?: number, password?: string) => Promise<string | null>;
  disableSharing: (index: number) => Promise<boolean>;
  addTags: (index: number, tags: string[]) => Promise<boolean>;
  removeTags: (index: number, tags: string[]) => Promise<boolean>;
}

export function useShareTags({
  uploadedFiles,
  showToast,
  enableSharing,
  disableSharing,
  addTags,
  removeTags,
}: UseShareTagsParams) {
  const [shareModalFile, setShareModalFile] = useState<UploadedFile | null>(null);
  const [tagManagerFile, setTagManagerFile] = useState<UploadedFile | null>(null);

  // End-to-end encrypted sharing (multi-recipient ECIES over the file DEK).
  const encryptedShare = useEncryptedShare();
  const [sharedWithMe, setSharedWithMe] = useState<SharedRecord[]>([]);
  const [sharedWithMeLoading, setSharedWithMeLoading] = useState(false);

  // Resolve an email to a recipient identity for the share modal. Returns null
  // (loudly surfaced by the modal) when the email has no published walt identity.
  const handleResolveRecipient = async (email: string): Promise<EncryptedRecipient | null> => {
    const resolved = await encryptedShare.resolveRecipientByEmail(email);
    if (!resolved) return null;
    return { id: resolved.id, email, publicKey: resolved.publicKey };
  };

  // Encrypt the open share-modal file to the chosen recipients and fan it out to
  // their inboxes. Throws on failure so the modal can surface the real message.
  const handleShareEncrypted = async (recipients: EncryptedRecipient[]): Promise<void> => {
    if (!shareModalFile) throw new Error('No file selected to share');
    await encryptedShare.shareWithRecipients(
      {
        id: shareModalFile.id,
        name: shareModalFile.name,
        type: shareModalFile.type,
        size: shareModalFile.size,
        gatewayUrl: shareModalFile.gatewayUrl,
        encryption: shareModalFile.encryption,
      },
      recipients.map((r) => ({ id: r.id, publicKey: r.publicKey }))
    );
    showToast(`Shared "${shareModalFile.name}" with ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}`, 'success');
  };

  // Load the current user's "Shared with you" inbox.
  const loadSharedWithMe = async () => {
    setSharedWithMeLoading(true);
    try {
      const records = await encryptedShare.listSharedWithMe();
      setSharedWithMe(records);
    } catch (error) {
      const realMessage = error instanceof Error ? error.message : undefined;
      showToast(realMessage || 'Could not load shared files', 'error');
    } finally {
      setSharedWithMeLoading(false);
    }
  };

  // Decrypt + download one shared record using the user's passphrase.
  const handleDownloadShared = async (record: SharedRecord, passphrase: string) => {
    try {
      await encryptedShare.downloadShared(record, passphrase);
      showToast(`Downloaded "${record.name}"`, 'success');
    } catch (error) {
      const realMessage = error instanceof Error ? error.message : undefined;
      showToast(realMessage || 'Decryption failed', 'error');
      throw error;
    }
  };

  const handleManageTags = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file) {
      setTagManagerFile(file);
    }
  };

  const handleAddTag = async (fileId: string, tag: string) => {
    const index = uploadedFiles.findIndex(f => f.id === fileId);
    if (index !== -1) {
      const success = await addTags(index, [tag]);
      if (success) {
        showToast(`Tag "${tag}" added`, 'success');
      } else {
        const appError = ErrorHandler.createAppError(new Error('Failed to add tag'));
        showToast(appError.userMessage, 'error');
      }
    }
  };

  const handleRemoveTag = async (fileId: string, tag: string) => {
    const index = uploadedFiles.findIndex(f => f.id === fileId);
    if (index !== -1) {
      const success = await removeTags(index, [tag]);
      if (success) {
        showToast(`Tag "${tag}" removed`, 'success');
      } else {
        const appError = ErrorHandler.createAppError(new Error('Failed to remove tag'));
        showToast(appError.userMessage, 'error');
      }
    }
  };

  const handleShare = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file) {
      setShareModalFile(file);
    }
  };

  const handleCreateShare = async (
    permission: 'viewer' | 'editor',
    expiryDate?: number,
    password?: string
  ): Promise<string | null> => {
    if (!shareModalFile) return null;

    const index = uploadedFiles.findIndex(f => f.id === shareModalFile.id);
    if (index === -1) return null;

    return await enableSharing(index, permission, expiryDate, password);
  };

  const handleDisableShare = async (): Promise<boolean> => {
    if (!shareModalFile) return false;

    const index = uploadedFiles.findIndex(f => f.id === shareModalFile.id);
    if (index === -1) return false;

    return await disableSharing(index);
  };

  return {
    shareModalFile,
    setShareModalFile,
    tagManagerFile,
    setTagManagerFile,
    handleManageTags,
    handleAddTag,
    handleRemoveTag,
    handleShare,
    handleCreateShare,
    handleDisableShare,
    // Encrypted sharing
    handleResolveRecipient,
    handleShareEncrypted,
    sharedWithMe,
    sharedWithMeLoading,
    loadSharedWithMe,
    handleDownloadShared,
  };
}
