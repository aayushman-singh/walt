/**
 * Everything above the file grid/list inside <main>: billing & pinning warning
 * banners, breadcrumb, trash auto-delete warning, the cleanup-mode selection
 * toolbar, the empty-trash button, and the sort/view toolbar. Extracted verbatim
 * from pages/dashboard.tsx.
 */

import React from 'react';
import { BillingStatus } from '../../lib/billingClient';
import WIcon, { WIconName } from '../WIcon';
import { ActiveView, UploadedFile, ViewMode } from './types';

interface FolderPathItem {
  id: string;
  name: string;
}

interface FileAreaHeaderProps {
  styles: { [key: string]: string };
  showBillingWarning: boolean;
  billingStatus: BillingStatus | null;
  formatChargeAmount: (status?: BillingStatus | null) => string;
  getBillingDayLabel: (status: BillingStatus) => string;
  setShowPaymentModal: (show: boolean) => void;
  dismissBillingWarning: () => void;
  pinningWarning: string | null;
  activeView: ActiveView;
  folderPath: FolderPathItem[];
  setCurrentFolderId: (id: string | null) => void;
  setActiveView: (view: ActiveView) => void;
  handleFileMove: (fileId: string, targetFolderId: string | null) => void;
  getTrashedItems: () => UploadedFile[];
  autoCleanupTrash: () => Promise<{ deleted: number; unpinned: number }>;
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
  cleanupMode: boolean;
  setCleanupMode: (mode: boolean) => void;
  selectedFiles: Set<string>;
  setSelectedFiles: (files: Set<string>) => void;
  filteredFiles: UploadedFile[];
  formatFileSize: (bytes?: number) => string;
  handleBulkRestore: () => void;
  handleBulkPermanentlyDelete: () => void;
  handleBulkDownload: () => void;
  handleBulkMoveToTrash: () => void;
  deselectAllFiles: () => void;
  handleEmptyTrash: () => void;
  selectAllFiles: () => void;
  handleCreateFolder: () => void;
  sortBy: string;
  setSortBy: (value: any) => void;
  sortDirection: 'asc' | 'desc';
  setSortDirection: (value: 'asc' | 'desc') => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  showColumnSettings: boolean;
  setShowColumnSettings: (show: boolean) => void;
  uploadedFiles: UploadedFile[];
}

const FileAreaHeader: React.FC<FileAreaHeaderProps> = (props) => {
  const {
    styles,
    showBillingWarning,
    billingStatus,
    formatChargeAmount,
    getBillingDayLabel,
    setShowPaymentModal,
    dismissBillingWarning,
    pinningWarning,
    activeView,
    folderPath,
    setCurrentFolderId,
    setActiveView,
    handleFileMove,
    getTrashedItems,
    autoCleanupTrash,
    showToast,
    cleanupMode,
    setCleanupMode,
    selectedFiles,
    setSelectedFiles,
    filteredFiles,
    formatFileSize,
    handleBulkRestore,
    handleBulkPermanentlyDelete,
    handleBulkDownload,
    handleBulkMoveToTrash,
    deselectAllFiles,
    handleEmptyTrash,
    selectAllFiles,
    handleCreateFolder,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    viewMode,
    setViewMode,
    showColumnSettings,
    setShowColumnSettings,
    uploadedFiles,
  } = props;

  return (
    <>
      {showBillingWarning && billingStatus && (
        <div className={styles.billingWarningBanner}>
          <div className={styles.billingWarningIcon}><WIcon name="warning" size={18} /></div>
          <div className={styles.billingWarningContent}>
            <div className={styles.billingWarningTitle}>Free tier exceeded</div>
            <p className={styles.billingWarningText}>
              You&apos;re using {billingStatus.pinnedSizeGB.toFixed(2)} GB (free tier: {billingStatus.freeTierGB} GB).
              Overage of {formatChargeAmount(billingStatus)} will be charged on {getBillingDayLabel(billingStatus)}.
            </p>
            <div className={styles.billingWarningActions}>
              <button
                className={styles.billingWarningAction}
                onClick={() => setShowPaymentModal(true)}
              >
                Add payment now
              </button>
              <button
                className={styles.billingWarningDismiss}
                onClick={dismissBillingWarning}
              >
                Dismiss for 14 days
              </button>
            </div>
          </div>
        </div>
      )}
      {pinningWarning && (
        <div className={styles.pinningWarningBanner}>
          <div className={styles.pinningWarningIcon}><WIcon name="warning" size={18} /></div>
          <div>
            <div className={styles.pinningWarningTitle}>Pinning Service Attention Needed</div>
            <p className={styles.pinningWarningText}>{pinningWarning}</p>
          </div>
        </div>
      )}
      {/* Breadcrumb Navigation */}
      {activeView === 'drive' && (
        <div className={styles.breadcrumb}>
          <span
            className={styles.breadcrumbItem}
            onClick={() => {
              setCurrentFolderId(null);
              setActiveView('drive');
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              (e.currentTarget as HTMLElement).classList.add('dragOver');
            }}
            onDragLeave={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const isOutside = e.clientX < rect.left || e.clientX >= rect.right ||
                               e.clientY < rect.top || e.clientY >= rect.bottom;
              if (isOutside) {
                (e.currentTarget as HTMLElement).classList.remove('dragOver');
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              (e.currentTarget as HTMLElement).classList.remove('dragOver');

              const draggedFileId = e.dataTransfer.getData('text/plain');
              if (draggedFileId) {
                handleFileMove(draggedFileId, null);
              }
            }}
          >
            My Drive
          </span>
          {folderPath.map((folder) => (
            <React.Fragment key={folder.id}>
              <span className={styles.breadcrumbSep}> / </span>
              <span
                className={styles.breadcrumbItem}
                onClick={() => {
                  setCurrentFolderId(folder.id);
                  setActiveView('drive');
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).classList.add('dragOver');
                }}
                onDragLeave={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const isOutside = e.clientX < rect.left || e.clientX >= rect.right ||
                                   e.clientY < rect.top || e.clientY >= rect.bottom;
                  if (isOutside) {
                    (e.currentTarget as HTMLElement).classList.remove('dragOver');
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).classList.remove('dragOver');

                  const draggedFileId = e.dataTransfer.getData('text/plain');
                  if (draggedFileId) {
                    handleFileMove(draggedFileId, folder.id);
                  }
                }}
              >
                {folder.name}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Trash Auto-Delete Warning */}
      {activeView === 'trash' && (() => {
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const trashedFiles = getTrashedItems();
        const expiredFiles = trashedFiles.filter(f => f.trashedDate && (now - f.trashedDate) >= thirtyDaysMs);
        const warningFiles = trashedFiles.filter(f => {
          if (!f.trashedDate) return false;
          const age = now - f.trashedDate;
          return age >= (thirtyDaysMs - sevenDaysMs) && age < thirtyDaysMs;
        });

        if (expiredFiles.length === 0 && warningFiles.length === 0) return null;

        return (
          <div className={styles.trashWarningBanner}>
            <div className={styles.trashWarningContent}>
              <span className={styles.trashWarningIcon}><WIcon name="warning" size={18} /></span>
              <div className={styles.trashWarningText}>
                {expiredFiles.length > 0 && (
                  <strong>{expiredFiles.length} item{expiredFiles.length !== 1 ? 's' : ''} will be permanently deleted and unpinned automatically (older than 30 days)</strong>
                )}
                {expiredFiles.length > 0 && warningFiles.length > 0 && <span> • </span>}
                {warningFiles.length > 0 && (() => {
                  const oldestWarningFile = warningFiles.reduce((oldest, f) => {
                    if (!oldest.trashedDate) return f;
                    if (!f.trashedDate) return oldest;
                    const age = now - f.trashedDate;
                    const oldestAge = now - oldest.trashedDate;
                    return age > oldestAge ? f : oldest;
                  }, warningFiles[0]);
                  const daysRemaining = oldestWarningFile.trashedDate
                    ? Math.max(0, Math.ceil((thirtyDaysMs - (now - oldestWarningFile.trashedDate)) / (24 * 60 * 60 * 1000)))
                    : 0;
                  return (
                    <span>{warningFiles.length} item{warningFiles.length !== 1 ? 's' : ''} will be deleted in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</span>
                  );
                })()}
              </div>
              {expiredFiles.length > 0 && (
                <button
                  className={styles.cleanupTrashBtn}
                  onClick={async () => {
                    const result = await autoCleanupTrash();
                    if (result.deleted > 0 || result.unpinned > 0) {
                      showToast(`${result.deleted} item${result.deleted !== 1 ? 's' : ''} deleted${result.unpinned > 0 ? `, ${result.unpinned} unpinned` : ''}`, 'success');
                    }
                  }}
                >
                  Clean Up Now
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Selection Toolbar - Only in cleanup mode */}
      {cleanupMode && selectedFiles.size > 0 && (
        <div className={styles.selectionToolbar}>
          <div className={styles.selectionInfo}>
            <span className={styles.selectionCount}>
              {selectedFiles.size} {selectedFiles.size === 1 ? 'item' : 'items'} selected
            </span>
            <span className={styles.selectionSize}>
              {formatFileSize(
                filteredFiles
                  .filter(f => selectedFiles.has(f.id) && !f.isFolder)
                  .reduce((sum, f) => sum + (f.size || 0), 0)
              )}
            </span>
          </div>
          <div className={styles.selectionActions}>
            {activeView === 'trash' ? (
              <>
                <button
                  className={styles.selectionBtn}
                  onClick={handleBulkRestore}
                  title="Restore selected files"
                >
                  <WIcon name="history" size={16} /> Restore
                </button>
                <button
                  className={`${styles.selectionBtn} ${styles.selectionBtnDanger}`}
                  onClick={handleBulkPermanentlyDelete}
                  title="Permanently delete selected files"
                >
                  <WIcon name="trash" size={16} /> Delete Permanently
                </button>
              </>
            ) : (
              <>
                <button
                  className={styles.selectionBtn}
                  onClick={handleBulkDownload}
                  disabled={selectedFiles.size > 2}
                  title={
                    selectedFiles.size > 2
                      ? "Download is limited to 2 files at a time. ZIP download feature coming soon!"
                      : "Download selected files"
                  }
                  style={selectedFiles.size > 2 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                >
                  <WIcon name="download" size={16} /> Download
                </button>
                <button
                  className={`${styles.selectionBtn} ${styles.selectionBtnDanger}`}
                  onClick={handleBulkMoveToTrash}
                  title="Move selected files to trash"
                >
                  <WIcon name="trash" size={16} /> Move to trash
                </button>
              </>
            )}
            <button
              className={styles.selectionBtn}
              onClick={deselectAllFiles}
              title="Deselect all"
            >
              <WIcon name="close" size={16} /> Deselect
            </button>
            <button
              className={styles.selectionBtn}
              onClick={() => {
                setCleanupMode(false);
                setSelectedFiles(new Set());
              }}
              title="Exit cleanup mode"
            >
              Exit Cleanup Mode
            </button>
          </div>
        </div>
      )}

      {/* Empty Trash Button - Only in trash view and cleanup mode */}
      {cleanupMode && activeView === 'trash' && (
        <div className={styles.emptyTrashContainer}>
          <button
            className={`${styles.selectionBtn} ${styles.selectionBtnDanger}`}
            onClick={handleEmptyTrash}
            title="Permanently delete all items in trash"
          >
            <WIcon name="trash" size={16} /> Empty Trash
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {activeView === 'drive' && !cleanupMode && (
            <button
              className={styles.newFolderBtn}
              onClick={handleCreateFolder}
              title="Create new folder"
            >
              <WIcon name="folder" size={16} />+ New Folder
            </button>
          )}
          {cleanupMode && (
            <button
              className={styles.selectAllBtn}
              onClick={selectedFiles.size === filteredFiles.length ? deselectAllFiles : selectAllFiles}
              title={selectedFiles.size === filteredFiles.length ? "Deselect all files" : "Select all files"}
            >
              {selectedFiles.size === filteredFiles.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {/* Sorting dropdown */}
          <select
            className={styles.sortSelect}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            title="Sort by"
          >
            <option value="name">Name</option>
            <option value="date">Modified</option>
            <option value="size">Size</option>
            <option value="type">Type</option>
          </select>
          <button
            className={styles.sortDirection}
            onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
            title={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
          >
            {sortDirection === 'asc' ? <WIcon name="sortAsc" size={18} /> : <WIcon name="sortDesc" size={18} />}
          </button>
          <button
            className={viewMode === 'grid' ? styles.viewBtnActive : styles.viewBtn}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <WIcon name="grid" size={18} />
          </button>
          <button
            className={viewMode === 'list' ? styles.viewBtnActive : styles.viewBtn}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <WIcon name="list" size={18} />
          </button>
          {viewMode === 'list' && (
            <button
              className={styles.columnSettingsBtn}
              onClick={() => setShowColumnSettings(!showColumnSettings)}
              title="Column settings"
            >
              <WIcon name="sheet" size={18} />
            </button>
          )}
          {uploadedFiles.length > 0 && (activeView === 'drive' || activeView === 'trash') && (
            <button
              className={styles.clearBtn}
              onClick={() => {
                if (cleanupMode) {
                  setCleanupMode(false);
                  setSelectedFiles(new Set());
                } else {
                  setCleanupMode(true);
                }
              }}
            >
              {cleanupMode ? 'Exit Cleanup Mode' : 'Clean Up Storage'}
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default FileAreaHeader;
