/**
 * All page-level modals/panels for the dashboard: share, preview, column
 * settings, tag manager, storage cleanup, hover preview, details panel, toast,
 * confirmation, input, duplicate-file, payment, gateway settings, two-factor,
 * and version history. Extracted verbatim from pages/dashboard.tsx.
 */

import React from 'react';
import ShareModal from '../ShareModal';
import PreviewModal from '../PreviewModal';
import FileDetailsPanel from '../FileDetailsPanel';
import StorageCleanupModal from '../StorageCleanupModal';
import TagManager from '../TagManager';
import FilePreviewHover from '../FilePreviewHover';
import ColumnSettings from '../ColumnSettings';
import GatewaySettings from '../GatewaySettings';
import TwoFactorSetup from '../TwoFactorSetup';
import VersionHistory from '../VersionHistory';
import Toast from '../Toast';
import ConfirmationModal from '../ConfirmationModal';
import InputModal from '../InputModal';
import PaymentModal from '../PaymentModal';
import DuplicateFileModal from '../DuplicateFileModal';
import { DEFAULT_BILLING_CYCLE_DAYS } from '../../lib/pinningService';
import { BillingStatus } from '../../lib/billingClient';
import { ErrorHandler } from '../../lib/errorHandler';
import {
  ConfirmationModalState,
  DashboardFilters,
  DuplicateFileModalState,
  InputModalState,
  ToastState,
  UploadedFile,
  VisibleColumns,
  ActiveView,
} from './types';

interface DashboardModalsProps {
  shareModalFile: UploadedFile | null;
  setShareModalFile: (file: UploadedFile | null) => void;
  handleCreateShare: (permission: 'viewer' | 'editor', expiryDate?: number, password?: string) => Promise<string | null>;
  handleDisableShare: () => Promise<boolean>;
  previewModalFile: UploadedFile | null;
  setPreviewModalFile: (file: UploadedFile | null) => void;
  showColumnSettings: boolean;
  setShowColumnSettings: (show: boolean) => void;
  visibleColumns: VisibleColumns;
  setVisibleColumns: React.Dispatch<React.SetStateAction<VisibleColumns>>;
  tagManagerFile: UploadedFile | null;
  setTagManagerFile: (file: UploadedFile | null) => void;
  getAllTags: () => string[];
  handleAddTag: (fileId: string, tag: string) => void;
  handleRemoveTag: (fileId: string, tag: string) => void;
  uploadedFiles: UploadedFile[];
  showStorageCleanup: boolean;
  setShowStorageCleanup: (show: boolean) => void;
  permanentlyDelete: (index: number) => Promise<boolean> | void;
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
  setCurrentFolderId: (id: string | null) => void;
  setActiveView: (view: ActiveView) => void;
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
  hoverPreviewFile: UploadedFile | null;
  hoverPreviewPosition: { x: number; y: number };
  setHoverPreviewFile: (file: UploadedFile | null) => void;
  detailsPanelFile: UploadedFile | null;
  setDetailsPanelFile: (file: UploadedFile | null) => void;
  handleDownload: (file: UploadedFile) => void;
  updateCustomProperties: (index: number, properties: Record<string, string>) => Promise<boolean>;
  handleShare: (fileId: string) => void;
  handlePinToggle: (fileId: string, file: UploadedFile, event?: React.MouseEvent) => void;
  toast: ToastState | null;
  setToast: (toast: ToastState | null) => void;
  confirmationModal: ConfirmationModalState;
  setConfirmationModal: React.Dispatch<React.SetStateAction<ConfirmationModalState>>;
  inputModal: InputModalState;
  setInputModal: React.Dispatch<React.SetStateAction<InputModalState>>;
  duplicateFileModal: DuplicateFileModalState;
  billingStatus: BillingStatus | null;
  showPaymentModal: boolean;
  setShowPaymentModal: (show: boolean) => void;
  loadBillingStatus: () => Promise<void>;
  showGatewaySettings: boolean;
  setShowGatewaySettings: (show: boolean) => void;
  showTwoFactorSetup: boolean;
  setShowTwoFactorSetup: (show: boolean) => void;
  versionHistoryFile: UploadedFile | null;
  setVersionHistoryFile: (file: UploadedFile | null) => void;
  handleRestoreVersion: (version: any) => Promise<void>;
}

const DashboardModals: React.FC<DashboardModalsProps> = (props) => {
  const {
    shareModalFile,
    setShareModalFile,
    handleCreateShare,
    handleDisableShare,
    previewModalFile,
    setPreviewModalFile,
    showColumnSettings,
    setShowColumnSettings,
    visibleColumns,
    setVisibleColumns,
    tagManagerFile,
    setTagManagerFile,
    getAllTags,
    handleAddTag,
    handleRemoveTag,
    uploadedFiles,
    showStorageCleanup,
    setShowStorageCleanup,
    permanentlyDelete,
    showToast,
    setCurrentFolderId,
    setActiveView,
    filters,
    setFilters,
    hoverPreviewFile,
    hoverPreviewPosition,
    setHoverPreviewFile,
    detailsPanelFile,
    setDetailsPanelFile,
    handleDownload,
    updateCustomProperties,
    handleShare,
    handlePinToggle,
    toast,
    setToast,
    confirmationModal,
    setConfirmationModal,
    inputModal,
    setInputModal,
    duplicateFileModal,
    billingStatus,
    showPaymentModal,
    setShowPaymentModal,
    loadBillingStatus,
    showGatewaySettings,
    setShowGatewaySettings,
    showTwoFactorSetup,
    setShowTwoFactorSetup,
    versionHistoryFile,
    setVersionHistoryFile,
    handleRestoreVersion,
  } = props;

  return (
    <>
      {/* Share Modal */}
      {shareModalFile && (
        <ShareModal
          fileName={shareModalFile.name}
          isOpen={true}
          onClose={() => setShareModalFile(null)}
          onShare={handleCreateShare}
          onDisableShare={handleDisableShare}
          existingShare={shareModalFile.shareConfig}
          isFolder={shareModalFile.isFolder}
        />
      )}

      {/* Preview Modal */}
      {previewModalFile && (
        <PreviewModal
          isOpen={true}
          fileName={previewModalFile.name}
          fileType={previewModalFile.type}
          gatewayUrl={previewModalFile.gatewayUrl}
          onClose={() => setPreviewModalFile(null)}
        />
      )}

      {/* Column Settings Modal */}
      {showColumnSettings && (
        <ColumnSettings
          visibleColumns={visibleColumns}
          onToggleColumn={(column) => {
            setVisibleColumns(prev => ({
              ...prev,
              [column]: !prev[column as keyof typeof prev]
            }));
          }}
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {/* Tag Manager Modal */}
      {tagManagerFile && (
        <TagManager
          fileId={tagManagerFile.id}
          currentTags={tagManagerFile.tags || []}
          allTags={getAllTags()}
          onAddTag={(tag) => {
            handleAddTag(tagManagerFile.id, tag);
            // Update local state to reflect the change
            const index = uploadedFiles.findIndex(f => f.id === tagManagerFile.id);
            if (index !== -1) {
              const updatedFile = { ...tagManagerFile, tags: [...(tagManagerFile.tags || []), tag.toLowerCase()] };
              setTagManagerFile(updatedFile);
            }
          }}
          onRemoveTag={(tag) => {
            handleRemoveTag(tagManagerFile.id, tag);
            // Update local state to reflect the change
            const index = uploadedFiles.findIndex(f => f.id === tagManagerFile.id);
            if (index !== -1) {
              const updatedFile = { ...tagManagerFile, tags: (tagManagerFile.tags || []).filter(t => t.toLowerCase() !== tag.toLowerCase()) };
              setTagManagerFile(updatedFile);
            }
          }}
          onClose={() => setTagManagerFile(null)}
        />
      )}

      {/* Storage Cleanup Modal */}
      {showStorageCleanup && (
        <StorageCleanupModal
          isOpen={true}
          files={uploadedFiles}
          onClose={() => setShowStorageCleanup(false)}
          onDelete={(fileIds) => {
            // Delete selected files
            fileIds.forEach(fileId => {
              const index = uploadedFiles.findIndex(f => f.id === fileId);
              if (index !== -1) {
                permanentlyDelete(index);
              }
            });
            showToast(`Deleted ${fileIds.length} file${fileIds.length !== 1 ? 's' : ''}`, 'success');
            setShowStorageCleanup(false);
          }}
          onCategoryClick={(category) => {
            // Map category names to filter types
            let fileType: 'all' | 'image' | 'video' | 'audio' | 'document' | 'folder' | 'other' = 'all';

            if (category === 'Images') {
              fileType = 'image';
            } else if (category === 'Videos') {
              fileType = 'video';
            } else if (category === 'Audio') {
              fileType = 'audio';
            } else if (category === 'PDFs' || category === 'Documents' || category === 'Spreadsheets') {
              fileType = 'document';
            } else if (category === 'Archives' || category === 'Other') {
              fileType = 'other';
            }

            // Navigate to root folder and set filter
            setCurrentFolderId(null);
            setActiveView('drive');
            setFilters({
              ...filters,
              fileType: fileType
            });
            setShowStorageCleanup(false);
            showToast(`Filtered by ${category.toLowerCase()}`, 'success');
          }}
        />
      )}

      {/* Hover Preview */}
      {hoverPreviewFile && (
        <FilePreviewHover
          file={hoverPreviewFile}
          position={hoverPreviewPosition}
          onClose={() => setHoverPreviewFile(null)}
        />
      )}

      {/* Details Panel */}
      {detailsPanelFile && (
        <FileDetailsPanel
          isOpen={true}
          file={detailsPanelFile as any}
          onClose={() => setDetailsPanelFile(null)}
          onDownload={() => handleDownload(detailsPanelFile)}
          onUpdateProperties={async (properties: Record<string, string>) => {
            const index = uploadedFiles.findIndex(f => f.id === detailsPanelFile.id);
            if (index !== -1) {
              const success = await updateCustomProperties(index, properties);
              if (success) {
                showToast('Custom properties updated', 'success');
                // Update the details panel file
                const updatedFile = uploadedFiles[index];
                setDetailsPanelFile({ ...updatedFile });
              } else {
                const appError = ErrorHandler.createAppError(new Error('Failed to update custom properties'));
                showToast(appError.userMessage, 'error');
              }
            }
          }}
          onShare={() => handleShare(detailsPanelFile.id)}
          onTogglePin={() => handlePinToggle(detailsPanelFile.id, detailsPanelFile)}
        />
      )}

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          title={toast.title}
          progress={toast.progress}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={confirmationModal.confirmText}
        cancelText={confirmationModal.cancelText}
        onConfirm={confirmationModal.onConfirm}
        onCancel={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
        type={confirmationModal.type}
        showSuppressOption={confirmationModal.showSuppressOption}
        onSuppressChange={confirmationModal.onSuppressChange}
      />

      {/* Input Modal */}
      <InputModal
        isOpen={inputModal.isOpen}
        title={inputModal.title}
        message={inputModal.message}
        placeholder={inputModal.placeholder}
        defaultValue={inputModal.defaultValue}
        onConfirm={inputModal.onConfirm}
        onCancel={() => setInputModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Duplicate File Modal */}
      <DuplicateFileModal
        isOpen={duplicateFileModal.isOpen}
        fileName={duplicateFileModal.fileName}
        onReplace={() => duplicateFileModal.onResolve('replace')}
        onKeepBoth={() => duplicateFileModal.onResolve('keepBoth')}
        onCancel={() => duplicateFileModal.onResolve('cancel')}
        hasMultipleDuplicates={duplicateFileModal.hasMultipleDuplicates}
        remainingCount={duplicateFileModal.remainingCount}
        onYesToAll={duplicateFileModal.onYesToAll}
        onNoToAll={duplicateFileModal.onNoToAll}
      />

      {/* Payment Modal */}
      {billingStatus && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          monthlyCostUSD={billingStatus.monthlyCostUSD}
          chargeAmountINR={billingStatus.chargeAmountINR}
          freeTierLimitUSD={billingStatus.freeTierLimitUSD}
          pinnedSizeGB={billingStatus.pinnedSizeGB}
          freeTierGB={billingStatus.freeTierGB}
          costPerGB={billingStatus.costPerGB}
          billingPeriod={billingStatus.billingPeriod}
          nextBillingDate={billingStatus.nextBillingDate}
          billingCycleDays={DEFAULT_BILLING_CYCLE_DAYS}
          onPaymentSuccess={async () => {
            await loadBillingStatus();
            showToast('Payment information added successfully!', 'success');
          }}
        />
      )}

      {/* Gateway Settings Modal */}
      <GatewaySettings
        isOpen={showGatewaySettings}
        onClose={() => setShowGatewaySettings(false)}
      />

      {/* Two-Factor Authentication Setup */}
      <TwoFactorSetup
        isOpen={showTwoFactorSetup}
        onClose={() => setShowTwoFactorSetup(false)}
        onEnabled={() => {
          showToast('Two-factor authentication enabled!', 'success');
          setShowTwoFactorSetup(false);
        }}
      />

      {/* Version History Modal */}
      {versionHistoryFile && (
        <VersionHistory
          isOpen={true}
          fileId={versionHistoryFile.id}
          fileName={versionHistoryFile.name}
          onClose={() => setVersionHistoryFile(null)}
          onRestore={handleRestoreVersion}
        />
      )}
    </>
  );
};

export default DashboardModals;
