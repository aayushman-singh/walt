/**
 * Desktop sidebar: upload dropzone + New menu, hidden file input, view nav,
 * auto-pin toggle, and the storage overview panel. Extracted verbatim from
 * pages/dashboard.tsx.
 */

import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { BillingStatus } from '../../lib/billingClient';
import FolderIcon from '@rsuite/icons/FolderFill';
import StarIcon from '@rsuite/icons/Star';
import StarOutlineIcon from '@rsuite/icons/Star';
import PinedIcon from '@rsuite/icons/Pined';
import TrashIcon from '@rsuite/icons/Trash';
import TableIcon from '@rsuite/icons/Table';
import PageIcon from '@rsuite/icons/Page';
import GearIcon from '@rsuite/icons/Gear';
import SettingIcon from '@rsuite/icons/Setting';
import TimeIcon from '@rsuite/icons/Time';
import { ActiveView } from './types';

interface StorageStats {
  totalFiles: number;
  totalSize: number;
  pinnedCount: number;
  pinnedSize: number;
  unpinnedCount: number;
  unpinnedSize: number;
}

interface SidebarProps {
  styles: { [key: string]: string };
  getRootProps: () => any;
  getInputProps: () => any;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  isFileInputProcessingRef: React.MutableRefObject<boolean>;
  onDrop: (files: File[]) => Promise<void>;
  isUploading: boolean;
  handleCreateFolder: () => void;
  handleFileUploadClick: (e?: React.MouseEvent) => void;
  activeView: ActiveView;
  handleViewChange: (view: ActiveView) => void;
  setCurrentFolderId: (id: string | null) => void;
  autoPinEnabled: boolean;
  setAutoPinEnabled: (enabled: boolean) => void;
  setShowStorageCleanup: (show: boolean) => void;
  setShowGatewaySettings: (show: boolean) => void;
  storageStats: StorageStats;
  formatFileSize: (bytes?: number) => string;
  formatDate: (isoDate?: string) => string;
  billingStatus: BillingStatus | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  styles,
  getRootProps,
  getInputProps,
  fileInputRef,
  isFileInputProcessingRef,
  onDrop,
  isUploading,
  handleCreateFolder,
  handleFileUploadClick,
  activeView,
  handleViewChange,
  setCurrentFolderId,
  autoPinEnabled,
  setAutoPinEnabled,
  setShowStorageCleanup,
  setShowGatewaySettings,
  storageStats,
  formatFileSize,
  formatDate,
  billingStatus,
}) => {
  return (
    <aside className={styles.sidebar}>
      <div {...getRootProps()} className={styles.uploadSection}>
        <input {...getInputProps()} />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={async (e) => {
            // Prevent multiple triggers
            if (isFileInputProcessingRef.current) {
              e.target.value = '';
              return;
            }

            if (e.target.files && e.target.files.length > 0) {
              isFileInputProcessingRef.current = true;
              const files = Array.from(e.target.files);

              try {
                // Process files asynchronously
                await onDrop(files);
              } catch (error) {
                console.error('File upload error:', error);
              } finally {
                // Reset input so same file can be selected again
                e.target.value = '';
                // Allow file input to be used again after a short delay
                setTimeout(() => {
                  isFileInputProcessingRef.current = false;
                }, 300);
              }
            } else {
              e.target.value = '';
              isFileInputProcessingRef.current = false;
            }
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
          className={styles.newButton}
          disabled={isUploading}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <span className={styles.plusIcon}>+</span>
          {isUploading ? 'Uploading...' : 'New'}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleCreateFolder}>
              <FolderIcon /> New Folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation();
              handleFileUploadClick(e);
            }}>
              <PageIcon /> File Upload
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className={styles.sidebarNav}>
        <div
          className={`${styles.navItem} ${activeView === 'drive' ? styles.active : ''}`}
          onClick={() => {
            handleViewChange('drive');
            setCurrentFolderId(null);
          }}
        >
          <span className={styles.navIcon}><FolderIcon /></span>
          <span>My Drive</span>
        </div>
        <div
          className={`${styles.navItem} ${activeView === 'recent' ? styles.active : ''}`}
          onClick={() => handleViewChange('recent')}
        >
          <span className={styles.navIcon}><TimeIcon /></span>
          <span>Recent</span>
        </div>
        <div
          className={`${styles.navItem} ${activeView === 'starred' ? styles.active : ''}`}
          onClick={() => handleViewChange('starred')}
        >
          <span className={styles.navIcon}>{activeView === 'starred' ? <StarIcon /> : <StarOutlineIcon />}</span>
          <span>Starred</span>
        </div>
        <div
          className={`${styles.navItem} ${activeView === 'trash' ? styles.active : ''}`}
          onClick={() => handleViewChange('trash')}
        >
          <span className={styles.navIcon}><TrashIcon /></span>
          <span>Trash</span>
        </div>
      </nav>

      {/* Auto-pin Toggle */}
      <div className={styles.autoPinSection}>
        <label className={styles.autoPinLabel}>
          <input
            type="checkbox"
            checked={autoPinEnabled}
            onChange={(e) => setAutoPinEnabled(e.target.checked)}
            className={styles.autoPinCheckbox}
          />
          <span className={styles.autoPinText}>
            <PinedIcon /> Auto-pin uploads
          </span>
        </label>
        <p className={styles.autoPinHint}>
          {autoPinEnabled
            ? 'New files will be pinned automatically (guaranteed persistence)'
            : ''}
        </p>

        {!autoPinEnabled && (
          <p className={styles.autoPinHint} style={{ marginTop: '8px', color: '#10b981' }}>
            Tip: Unpinned files are FREE but may be lost. Enable auto-pin for guaranteed persistence.
          </p>
        )}
      </div>

      <div className={styles.storageInfo}>
        <div className={styles.storageStats}>
          <div className={styles.storageHeader}>
            <div className={styles.storageActions}>
              <button
                className={styles.cleanupBtn}
                onClick={() => setShowStorageCleanup(true)}
                title="Clean up storage"
              >
                <GearIcon /> Clean Up Storage
              </button>
              <button
                className={styles.gatewayBtn}
                onClick={() => setShowGatewaySettings(true)}
                title="Gateway/CDN settings"
              >
                <SettingIcon /> Gateways
              </button>
            </div>
            <h4 className={styles.storageTitle}>Storage Overview</h4>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Total Files:</span>
            <span className={styles.statValue}>{storageStats.totalFiles}</span>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Total Size:</span>
            <span className={styles.statValue}>{formatFileSize(storageStats.totalSize)}</span>
          </div>
          <hr className={styles.statDivider} />
          <div className={styles.statRow}>
            <span className={styles.statLabel}><PinedIcon /> Pinned (Paid):</span>
            <span className={styles.statValue}>
              {storageStats.pinnedCount} ({formatFileSize(storageStats.pinnedSize)})
            </span>
          </div>
          {billingStatus && storageStats.pinnedSize > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel}>💰 Usage:</span>
              <span className={styles.statValue}>
                {billingStatus.pinnedSizeGB.toFixed(2)} GB / {billingStatus.freeTierGB} GB free
              </span>
            </div>
          )}
          {billingStatus && billingStatus.monthlyCostUSD > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Est. Monthly Cost:</span>
              <span className={styles.statValue}>
                ${billingStatus.monthlyCostUSD.toFixed(2)}/month
              </span>
            </div>
          )}
          {billingStatus && (
            <>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Next Billing:</span>
                <span className={styles.statValue}>{formatDate(billingStatus.nextBillingDate)}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Pricing:</span>
                <span className={styles.statValue}>{billingStatus.freeTierGB} GB free, then ${billingStatus.costPerGB}/GB</span>
              </div>
            </>
          )}
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Unpinned (FREE):</span>
            <span className={styles.statValue + ' ' + (storageStats.unpinnedCount > 0 ? styles.warning : '')}>
              {storageStats.unpinnedCount} ({formatFileSize(storageStats.unpinnedSize)})
            </span>
          </div>
          {storageStats.unpinnedCount > 0 && (
            <p className={styles.warningText}>
              Unpinned files are FREE but may be lost! Pin them for guaranteed persistence.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
