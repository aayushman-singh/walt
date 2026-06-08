/**
 * Dashboard Page - Main File Management Interface
 *
 * This is the heart of the app: a Google Drive-like interface backed by IPFS.
 * Key architectural decisions:
 * - State lives in useUserFileStorage hook (allows offline-first operation)
 * - Modals are controlled at page level to coordinate global state
 * - File operations are optimistic (UI updates immediately, save happens async)
 * - Keyboard shortcuts mirror Google Drive for familiar UX
 *
 * The page is an orchestrator: data + logic live in domain hooks under
 * components/dashboard/hooks, and the UI is composed from presentational
 * components under components/dashboard. Behaviour is identical to the previous
 * monolith — this split only relocates code.
 */

import React from 'react';
import { NextPage } from 'next';
import SkeletonLoader from '../components/SkeletonLoader';

import {
  formatFileSize,
  formatDate,
  formatChargeAmount,
  getBillingDayLabel,
} from '../components/dashboard/utils';
import Header from '../components/dashboard/Header';
import Sidebar from '../components/dashboard/Sidebar';
import MobileMenu from '../components/dashboard/MobileMenu';
import FileAreaHeader from '../components/dashboard/FileAreaHeader';
import EmptyState from '../components/dashboard/EmptyState';
import FileGrid from '../components/dashboard/FileGrid';
import FileList from '../components/dashboard/FileList';
import ProgressPanels from '../components/dashboard/ProgressPanels';
import DashboardModals from '../components/dashboard/DashboardModals';
import { useDashboardController } from '../components/dashboard/hooks/useDashboardController';

const Dashboard: NextPage = () => {
  // All page state + domain-hook wiring lives in the controller; the page is a view.
  const {
    styles, router, user, authLoading, handleLogout, showToast, theme, setTheme,
    viewMode, setViewMode, searchTerm, setSearchTerm, activeView, setActiveView,
    showStorageCleanup, setShowStorageCleanup, cleanupMode, setCleanupMode,
    showFilters, setShowFilters, showColumnSettings, setShowColumnSettings,
    showGatewaySettings, setShowGatewaySettings, showTwoFactorSetup, setShowTwoFactorSetup,
    visibleColumns, setVisibleColumns, filters, setFilters,
    toast, setToast, isDragging, setIsDragging,
    showKeyboardShortcuts, setShowKeyboardShortcuts, showMobileMenu, setShowMobileMenu,
    confirmationModal, setConfirmationModal, inputModal, setInputModal, duplicateFileModal,
    fileInputRef, isFileInputProcessingRef,
    uploadedFiles, filesLoading, pinningWarning, autoPinEnabled, setAutoPinEnabled,
    encryptionEnabled, toggleEncryption,
    getAllTags, currentFolderId, setCurrentFolderId,
    sortBy, setSortBy, sortDirection, setSortDirection,
    permanentlyDelete, updateCustomProperties, getTrashedItems, autoCleanupTrash,
    storageStats, folderPath,
    getRootProps, getInputProps, isDragActive,
    filteredFiles, selectedFiles, setSelectedFiles,
    billing, search, fileOps, versionHistory, shareTags, exporter, upload, bulk,
  } = useDashboardController();

  // Show loading spinner only for initial auth check
  if (authLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className={`${styles.dashboard} ${styles[theme]} ${isDragging ? styles.draggingActive : ''}`}>
      <Header
        styles={styles}
        user={user}
        router={router}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        saveSearch={search.saveSearch}
        showSuggestions={search.showSuggestions}
        setShowSuggestions={search.setShowSuggestions}
        searchSuggestions={search.searchSuggestions}
        recentSearches={search.recentSearches}
        savedSearches={search.savedSearches}
        loadSavedSearch={search.loadSavedSearch}
        saveCurrentSearch={search.saveCurrentSearch}
        deleteSavedSearch={search.deleteSavedSearch}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filters={filters}
        setFilters={setFilters}
        getAllTags={getAllTags}
        showKeyboardShortcuts={showKeyboardShortcuts}
        setShowKeyboardShortcuts={setShowKeyboardShortcuts}
        showMobileMenu={showMobileMenu}
        setShowMobileMenu={setShowMobileMenu}
        theme={theme}
        setTheme={setTheme}
        shouldShowBillingCTA={billing.shouldShowBillingCTA}
        setShowPaymentModal={billing.setShowPaymentModal}
        handleExportAll={exporter.handleExportAll}
        handleLogout={handleLogout}
      />

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <MobileMenu
          styles={styles}
          setShowMobileMenu={setShowMobileMenu}
          getRootProps={getRootProps}
          getInputProps={getInputProps}
          isUploading={upload.isUploading}
          handleCreateFolder={fileOps.handleCreateFolder}
          handleFileUploadClick={fileOps.handleFileUploadClick}
          activeView={activeView}
          handleViewChange={fileOps.handleViewChange}
          setCurrentFolderId={setCurrentFolderId}
          autoPinEnabled={autoPinEnabled}
          setAutoPinEnabled={setAutoPinEnabled}
          encryptionEnabled={encryptionEnabled}
          toggleEncryption={toggleEncryption}
          setShowStorageCleanup={setShowStorageCleanup}
          setShowGatewaySettings={setShowGatewaySettings}
          storageStats={storageStats}
          formatFileSize={formatFileSize}
          formatDate={formatDate}
          billingStatus={billing.billingStatus}
        />
      )}

      {/* Main Content */}
      <div className={styles.mainContent}>
        <Sidebar
          styles={styles}
          getRootProps={getRootProps}
          getInputProps={getInputProps}
          fileInputRef={fileInputRef}
          isFileInputProcessingRef={isFileInputProcessingRef}
          onDrop={upload.onDrop}
          isUploading={upload.isUploading}
          handleCreateFolder={fileOps.handleCreateFolder}
          handleFileUploadClick={fileOps.handleFileUploadClick}
          activeView={activeView}
          handleViewChange={fileOps.handleViewChange}
          setCurrentFolderId={setCurrentFolderId}
          autoPinEnabled={autoPinEnabled}
          setAutoPinEnabled={setAutoPinEnabled}
          encryptionEnabled={encryptionEnabled}
          toggleEncryption={toggleEncryption}
          setShowStorageCleanup={setShowStorageCleanup}
          setShowGatewaySettings={setShowGatewaySettings}
          storageStats={storageStats}
          formatFileSize={formatFileSize}
          formatDate={formatDate}
          billingStatus={billing.billingStatus}
        />

        {/* File Display Area */}
        <main className={styles.fileArea}>
          <FileAreaHeader
            styles={styles}
            showBillingWarning={billing.showBillingWarning}
            billingStatus={billing.billingStatus}
            formatChargeAmount={formatChargeAmount}
            getBillingDayLabel={getBillingDayLabel}
            setShowPaymentModal={billing.setShowPaymentModal}
            dismissBillingWarning={billing.dismissBillingWarning}
            pinningWarning={pinningWarning}
            activeView={activeView}
            folderPath={folderPath}
            setCurrentFolderId={setCurrentFolderId}
            setActiveView={setActiveView}
            handleFileMove={upload.handleFileMove}
            getTrashedItems={getTrashedItems}
            autoCleanupTrash={autoCleanupTrash}
            showToast={showToast}
            cleanupMode={cleanupMode}
            setCleanupMode={setCleanupMode}
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            filteredFiles={filteredFiles}
            formatFileSize={formatFileSize}
            handleBulkRestore={bulk.handleBulkRestore}
            handleBulkPermanentlyDelete={bulk.handleBulkPermanentlyDelete}
            handleBulkDownload={bulk.handleBulkDownload}
            handleBulkMoveToTrash={bulk.handleBulkMoveToTrash}
            deselectAllFiles={bulk.deselectAllFiles}
            handleEmptyTrash={bulk.handleEmptyTrash}
            selectAllFiles={bulk.selectAllFiles}
            handleCreateFolder={fileOps.handleCreateFolder}
            sortBy={sortBy}
            setSortBy={setSortBy}
            sortDirection={sortDirection}
            setSortDirection={setSortDirection}
            viewMode={viewMode}
            setViewMode={setViewMode}
            showColumnSettings={showColumnSettings}
            setShowColumnSettings={setShowColumnSettings}
            uploadedFiles={uploadedFiles}
          />

          {/* Upload Dropzone Overlay */}
          {isDragActive && (
            <div className={styles.dropOverlay}>
              <div className={styles.dropMessage}>
                <span className={styles.dropIcon}>📤</span>
                <p>Drop files here to upload</p>
              </div>
            </div>
          )}

          {/* Files Display */}
          {filesLoading ? (
            viewMode === 'grid' ? (
              <div className={styles.fileGrid}>
                <SkeletonLoader type="file-card" count={8} />
              </div>
            ) : (
              <div className={styles.fileList}>
                <SkeletonLoader type="file-row" count={10} />
              </div>
            )
          ) : filteredFiles.length === 0 ? (
            <EmptyState
              styles={styles}
              activeView={activeView}
              getRootProps={getRootProps}
              getInputProps={getInputProps}
              user={user}
              showToast={showToast}
            />
          ) : viewMode === 'grid' ? (
            <FileGrid
              styles={styles}
              filteredFiles={filteredFiles}
              cleanupMode={cleanupMode}
              selectedFiles={selectedFiles}
              activeView={activeView}
              hoverTimeoutRef={fileOps.hoverTimeoutRef}
              formatFileSize={formatFileSize}
              toggleFileSelection={bulk.toggleFileSelection}
              handleFileClick={fileOps.handleFileClick}
              setHoverPreviewPosition={fileOps.setHoverPreviewPosition}
              setHoverPreviewFile={fileOps.setHoverPreviewFile}
              setIsDragging={setIsDragging}
              handleFolderDrop={upload.handleFolderDrop}
              handleFileMove={upload.handleFileMove}
              handleToggleStar={fileOps.handleToggleStar}
              handlePinToggle={fileOps.handlePinToggle}
              handlePreview={fileOps.handlePreview}
              handleShowDetails={fileOps.handleShowDetails}
              handleDownload={fileOps.handleDownload}
              copyToClipboard={fileOps.copyToClipboard}
              handleRename={fileOps.handleRename}
              handleDelete={fileOps.handleDelete}
              handleRestore={fileOps.handleRestore}
            />
          ) : (
            <FileList
              styles={styles}
              filteredFiles={filteredFiles}
              cleanupMode={cleanupMode}
              selectedFiles={selectedFiles}
              activeView={activeView}
              visibleColumns={visibleColumns}
              formatFileSize={formatFileSize}
              toggleFileSelection={bulk.toggleFileSelection}
              handleFileClick={fileOps.handleFileClick}
              handlePreview={fileOps.handlePreview}
              handleShowDetails={fileOps.handleShowDetails}
              handleDownload={fileOps.handleDownload}
              copyToClipboard={fileOps.copyToClipboard}
              handleRename={fileOps.handleRename}
              handleDelete={fileOps.handleDelete}
              handleRestore={fileOps.handleRestore}
            />
          )}
        </main>
      </div>

      <DashboardModals
        shareModalFile={shareTags.shareModalFile}
        setShareModalFile={shareTags.setShareModalFile}
        handleCreateShare={shareTags.handleCreateShare}
        handleDisableShare={shareTags.handleDisableShare}
        previewModalFile={fileOps.previewModalFile}
        setPreviewModalFile={fileOps.setPreviewModalFile}
        showColumnSettings={showColumnSettings}
        setShowColumnSettings={setShowColumnSettings}
        visibleColumns={visibleColumns}
        setVisibleColumns={setVisibleColumns}
        tagManagerFile={shareTags.tagManagerFile}
        setTagManagerFile={shareTags.setTagManagerFile}
        getAllTags={getAllTags}
        handleAddTag={shareTags.handleAddTag}
        handleRemoveTag={shareTags.handleRemoveTag}
        uploadedFiles={uploadedFiles}
        showStorageCleanup={showStorageCleanup}
        setShowStorageCleanup={setShowStorageCleanup}
        permanentlyDelete={permanentlyDelete}
        showToast={showToast}
        setCurrentFolderId={setCurrentFolderId}
        setActiveView={setActiveView}
        filters={filters}
        setFilters={setFilters}
        hoverPreviewFile={fileOps.hoverPreviewFile}
        hoverPreviewPosition={fileOps.hoverPreviewPosition}
        setHoverPreviewFile={fileOps.setHoverPreviewFile}
        detailsPanelFile={fileOps.detailsPanelFile}
        setDetailsPanelFile={fileOps.setDetailsPanelFile}
        handleDownload={fileOps.handleDownload}
        updateCustomProperties={updateCustomProperties}
        handleShare={shareTags.handleShare}
        handlePinToggle={fileOps.handlePinToggle}
        toast={toast}
        setToast={setToast}
        confirmationModal={confirmationModal}
        setConfirmationModal={setConfirmationModal}
        inputModal={inputModal}
        setInputModal={setInputModal}
        duplicateFileModal={duplicateFileModal}
        billingStatus={billing.billingStatus}
        showPaymentModal={billing.showPaymentModal}
        setShowPaymentModal={billing.setShowPaymentModal}
        loadBillingStatus={billing.loadBillingStatus}
        showGatewaySettings={showGatewaySettings}
        setShowGatewaySettings={setShowGatewaySettings}
        showTwoFactorSetup={showTwoFactorSetup}
        setShowTwoFactorSetup={setShowTwoFactorSetup}
        versionHistoryFile={versionHistory.versionHistoryFile}
        setVersionHistoryFile={versionHistory.setVersionHistoryFile}
        handleRestoreVersion={versionHistory.handleRestoreVersion}
      />

      <ProgressPanels
        styles={styles}
        uploadQueue={upload.uploadQueue}
        setUploadQueue={upload.setUploadQueue}
        uploadCompleteTimeoutRef={upload.uploadCompleteTimeoutRef}
        bulkOperationQueue={bulk.bulkOperationQueue}
        setBulkOperationQueue={bulk.setBulkOperationQueue}
        bulkOperationTimeoutRef={bulk.bulkOperationTimeoutRef}
        permanentDeleteQueue={bulk.permanentDeleteQueue}
        setPermanentDeleteQueue={bulk.setPermanentDeleteQueue}
        permanentDeleteTimeoutRef={bulk.permanentDeleteTimeoutRef}
      />
    </div>
  );
};

export default Dashboard;
