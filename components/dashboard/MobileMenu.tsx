/**
 * Mobile slide-over menu: upload, nav, auto-pin toggle, and storage overview.
 * Extracted verbatim from pages/dashboard.tsx (rendered only when showMobileMenu).
 */

import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { calculatePinningCost, DEFAULT_BILLING_CYCLE_DAYS } from '../../lib/pinningService';
import { BillingStatus } from '../../lib/billingClient';
import { billingCycleTitle } from './utils';
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
import CloseIcon from '@rsuite/icons/Close';
import { ActiveView } from './types';

interface StorageStats {
  totalFiles: number;
  totalSize: number;
  pinnedCount: number;
  pinnedSize: number;
  unpinnedCount: number;
  unpinnedSize: number;
}

interface MobileMenuProps {
  styles: { [key: string]: string };
  setShowMobileMenu: (show: boolean) => void;
  getRootProps: () => any;
  getInputProps: () => any;
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

const MobileMenu: React.FC<MobileMenuProps> = ({
  styles,
  setShowMobileMenu,
  getRootProps,
  getInputProps,
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
    <div className={styles.mobileMenuOverlay} onClick={() => setShowMobileMenu(false)}>
      <div className={styles.mobileMenu} onClick={(e) => e.stopPropagation()}>
        <div className={styles.mobileMenuHeader}>
          <h3>Menu</h3>
          <button
            className={styles.mobileMenuClose}
            onClick={() => setShowMobileMenu(false)}
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Upload Section */}
        <div {...getRootProps()} className={styles.uploadSection}>
          <input {...getInputProps()} />
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
              <DropdownMenuItem onClick={() => {
                handleCreateFolder();
                setShowMobileMenu(false);
              }}>
                <FolderIcon /> New Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                handleFileUploadClick(e);
                setShowMobileMenu(false);
              }}>
                <PageIcon /> File Upload
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Navigation */}
        <nav className={styles.mobileNav}>
          <div
            className={`${styles.navItem} ${activeView === 'drive' ? styles.active : ''}`}
            onClick={() => {
              handleViewChange('drive');
              setCurrentFolderId(null);
              setShowMobileMenu(false);
            }}
          >
            <span className={styles.navIcon}><FolderIcon /></span>
            <span>My Drive</span>
          </div>
          <div
            className={`${styles.navItem} ${activeView === 'recent' ? styles.active : ''}`}
            onClick={() => {
              handleViewChange('recent');
              setShowMobileMenu(false);
            }}
          >
            <span className={styles.navIcon}><TimeIcon /></span>
            <span>Recent</span>
          </div>
          <div
            className={`${styles.navItem} ${activeView === 'starred' ? styles.active : ''}`}
            onClick={() => {
              handleViewChange('starred');
              setShowMobileMenu(false);
            }}
          >
            <span className={styles.navIcon}>{activeView === 'starred' ? <StarIcon /> : <StarOutlineIcon />}</span>
            <span>Starred</span>
          </div>
          <div
            className={`${styles.navItem} ${activeView === 'trash' ? styles.active : ''}`}
            onClick={() => {
              handleViewChange('trash');
              setShowMobileMenu(false);
            }}
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
              : 'Unpinned files are FREE but may be lost! Turn on auto-pin for guaranteed persistence.'}
          </p>
        </div>

        {/* Storage Info */}
        <div className={styles.storageInfo}>
          <div className={styles.storageStats}>
            <div className={styles.storageHeader}>
              <div className={styles.storageActions}>
                <button
                  className={styles.cleanupBtn}
                  onClick={() => {
                    setShowStorageCleanup(true);
                    setShowMobileMenu(false);
                  }}
                  title="Clean up storage"
                >
                  <GearIcon /> Clean Up Storage
                </button>
                <button
                  className={styles.gatewayBtn}
                  onClick={() => {
                    setShowGatewaySettings(true);
                    setShowMobileMenu(false);
                  }}
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
            {storageStats.pinnedSize > 0 && (
              <div className={styles.statRow}>
                <span className={styles.statLabel}>💰 Est. {billingCycleTitle} Cost:</span>
                <span className={styles.statValue}>
                  {calculatePinningCost(storageStats.pinnedSize, DEFAULT_BILLING_CYCLE_DAYS)}
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
                  <span className={styles.statLabel}>Free Tier Limit:</span>
                  <span className={styles.statValue}>${billingStatus.freeTierLimitUSD.toFixed(2)}/month</span>
                </div>
              </>
            )}
            <div className={styles.statRow}>
              <span className={styles.statLabel}>🆓 Unpinned (Free):</span>
              <span className={styles.statValue}>
                {storageStats.unpinnedCount} ({formatFileSize(storageStats.unpinnedSize)})
              </span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}><TableIcon /> Total Size:</span>
              <span className={styles.statValue}>
                {formatFileSize(storageStats.totalSize)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileMenu;
