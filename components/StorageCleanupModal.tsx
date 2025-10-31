import React, { useState, useEffect } from 'react';
import styles from '../styles/StorageCleanupModal.module.css';
import {
  getCleanupRecommendations,
  getCleanupCandidates,
  CleanupCandidate,
  CleanupFilters
} from '../lib/storageCleanup';
import { UploadedFile } from '../hooks/useUserFileStorage';

interface StorageCleanupModalProps {
  isOpen: boolean;
  files: UploadedFile[];
  onClose: () => void;
  onDelete: (fileIds: string[]) => void;
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

const StorageCleanupModal: React.FC<StorageCleanupModalProps> = ({
  isOpen,
  files,
  onClose,
  onDelete
}) => {
  const [recommendations, setRecommendations] = useState<ReturnType<typeof getCleanupRecommendations> | null>(null);
  const [candidates, setCandidates] = useState<CleanupCandidate[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<CleanupFilters>({
    minSizeMB: 100,
    maxAgeDays: 180,
    unpinnedOnly: false
  });
  const [activeTab, setActiveTab] = useState<'recommendations' | 'custom'>('recommendations');

  useEffect(() => {
    if (isOpen && files.length > 0) {
      const recs = getCleanupRecommendations(files);
      setRecommendations(recs);
      updateCandidates(filters);
    }
  }, [isOpen, files]);

  const updateCandidates = (newFilters: CleanupFilters) => {
    const newCandidates = getCleanupCandidates(files, newFilters);
    setCandidates(newCandidates);
    setSelectedFileIds(new Set()); // Clear selection when filters change
  };

  const handleFilterChange = (key: keyof CleanupFilters, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    updateCandidates(newFilters);
  };

  const toggleFileSelection = (fileId: string) => {
    const newSelected = new Set(selectedFileIds);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFileIds(newSelected);
  };

  const selectAll = () => {
    setSelectedFileIds(new Set(candidates.map(c => c.file.id)));
  };

  const deselectAll = () => {
    setSelectedFileIds(new Set());
  };

  const handleDelete = () => {
    if (selectedFileIds.size === 0) return;
    
    onDelete(Array.from(selectedFileIds));
    setSelectedFileIds(new Set());
    onClose();
  };

  const totalSelectedSize = Array.from(selectedFileIds).reduce((total, fileId) => {
    const file = files.find(f => f.id === fileId);
    return total + (file?.size || 0);
  }, 0);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>🧹 Storage Cleanup</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'recommendations' ? styles.active : ''}`}
            onClick={() => setActiveTab('recommendations')}
          >
            💡 Recommendations
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'custom' ? styles.active : ''}`}
            onClick={() => setActiveTab('custom')}
          >
            🔍 Custom Search
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === 'recommendations' && recommendations && (
            <div className={styles.recommendations}>
              <div className={styles.summary}>
                <h3>Cleanup Opportunities</h3>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>📦 Large Files (100MB+)</div>
                    <div className={styles.summaryValue}>{recommendations.largeFiles}</div>
                  </div>
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>⏰ Old Files (180+ days)</div>
                    <div className={styles.summaryValue}>{recommendations.oldFiles}</div>
                  </div>
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>⚠️ Old Unpinned (30+ days)</div>
                    <div className={styles.summaryValue}>{recommendations.oldUnpinnedFiles}</div>
                  </div>
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>💾 Reclaimable Space</div>
                    <div className={styles.summaryValue}>{formatSize(recommendations.totalSizeReclaimable)}</div>
                  </div>
                </div>

                <h4>Top Storage Categories</h4>
                <div className={styles.categories}>
                  {recommendations.topCategories.map(({ category, size, count }) => (
                    <div key={category} className={styles.categoryItem}>
                      <span className={styles.categoryName}>{category}</span>
                      <span className={styles.categoryDetails}>{count} files • {formatSize(size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'custom' && (
            <div className={styles.custom}>
              <div className={styles.filters}>
                <div className={styles.filterGroup}>
                  <label>Minimum File Size (MB)</label>
                  <input
                    type="number"
                    value={filters.minSizeMB || ''}
                    onChange={(e) => handleFilterChange('minSizeMB', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="100"
                  />
                </div>

                <div className={styles.filterGroup}>
                  <label>Maximum Age (days)</label>
                  <input
                    type="number"
                    value={filters.maxAgeDays || ''}
                    onChange={(e) => handleFilterChange('maxAgeDays', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="180"
                  />
                </div>

                <div className={styles.filterGroup}>
                  <label>
                    <input
                      type="checkbox"
                      checked={filters.unpinnedOnly || false}
                      onChange={(e) => handleFilterChange('unpinnedOnly', e.target.checked)}
                    />
                    Unpinned only
                  </label>
                </div>
              </div>

              <div className={styles.candidatesHeader}>
                <div className={styles.candidatesInfo}>
                  <span>{candidates.length} files found</span>
                  <span>Total: {formatSize(candidates.reduce((sum, c) => sum + (c.file.size || 0), 0))}</span>
                </div>
                <div className={styles.selectionControls}>
                  <button onClick={selectAll} className={styles.selectBtn}>Select All</button>
                  <button onClick={deselectAll} className={styles.selectBtn}>Deselect All</button>
                </div>
              </div>

              <div className={styles.candidatesList}>
                {candidates.length === 0 ? (
                  <div className={styles.empty}>No files match the criteria</div>
                ) : (
                  candidates.map((candidate) => (
                    <div key={candidate.file.id} className={styles.candidateItem}>
                      <input
                        type="checkbox"
                        checked={selectedFileIds.has(candidate.file.id)}
                        onChange={() => toggleFileSelection(candidate.file.id)}
                      />
                      <div className={styles.candidateInfo}>
                        <div className={styles.candidateName}>{candidate.file.name}</div>
                        <div className={styles.candidateDetails}>{candidate.details}</div>
                      </div>
                      <div className={styles.candidateSize}>{formatSize(candidate.file.size || 0)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {activeTab === 'custom' && selectedFileIds.size > 0 && (
          <div className={styles.footer}>
            <div className={styles.footerInfo}>
              <span>{selectedFileIds.size} files selected</span>
              <span className={styles.footerSize}>Total: {formatSize(totalSelectedSize)}</span>
            </div>
            <div className={styles.footerActions}>
              <button onClick={onClose} className={styles.cancelBtn}>Cancel</button>
              <button onClick={handleDelete} className={styles.deleteBtn}>
                🗑️ Delete Selected
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StorageCleanupModal;

