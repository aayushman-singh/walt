/**
 * Version History Component
 * Displays file versions and allows restoring to previous versions
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FileVersion, getFileVersions, formatVersionDate } from '../lib/versionHistory';
import { formatFileSize } from '../lib/utils';
import styles from '../styles/VersionHistory.module.css';

interface VersionHistoryProps {
  isOpen: boolean;
  fileId: string;
  fileName: string;
  onClose: () => void;
  onRestore: (version: FileVersion) => Promise<void>;
}

const VersionHistory: React.FC<VersionHistoryProps> = ({
  isOpen,
  fileId,
  fileName,
  onClose,
  onRestore,
}) => {
  const { user } = useAuth();
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && fileId && user) {
      loadVersions();
    }
  }, [isOpen, fileId, user]);

  const loadVersions = async () => {
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/versions/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load versions');
      }

      setVersions(data.versions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load versions');
      console.error('Version history load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (version: FileVersion) => {
    if (!confirm(`Restore "${fileName}" to version ${version.version}? This will replace the current version.`)) {
      return;
    }

    setRestoringVersionId(version.versionId);
    setError('');

    try {
      await onRestore(version);
      await loadVersions(); // Reload to get updated versions
    } catch (err: any) {
      setError(err.message || 'Failed to restore version');
    } finally {
      setRestoringVersionId(null);
    }
  };

  const handleDownloadVersion = (version: FileVersion) => {
    // Open version in new tab or trigger download
    window.open(version.gatewayUrl, '_blank');
  };

  const sortedVersions = getFileVersions(versions, fileId);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>Version History</h2>
            <p className={styles.fileName}>{fileName}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading versions...</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : sortedVersions.length === 0 ? (
            <div className={styles.empty}>
              <p>No version history available for this file.</p>
              <p className={styles.emptySubtext}>Versions are created when files are uploaded or replaced.</p>
            </div>
          ) : (
            <>
              <div className={styles.versionsList}>
                {sortedVersions.map((version, index) => (
                  <div key={version.versionId} className={styles.versionItem}>
                    <div className={styles.versionHeader}>
                      <div className={styles.versionInfo}>
                        <div className={styles.versionBadge}>
                          {index === 0 && <span className={styles.currentBadge}>Current</span>}
                          <span className={styles.versionNumber}>v{version.version}</span>
                        </div>
                        <div className={styles.versionMeta}>
                          <span className={styles.versionDate}>
                            {formatVersionDate(version.timestamp)}
                          </span>
                          {version.size && (
                            <>
                              <span className={styles.versionSeparator}>•</span>
                              <span className={styles.versionSize}>{formatFileSize(version.size)}</span>
                            </>
                          )}
                        </div>
                        {version.changeDescription && (
                          <div className={styles.versionDescription}>
                            {version.changeDescription}
                          </div>
                        )}
                      </div>
                      <div className={styles.versionActions}>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleDownloadVersion(version)}
                          title="Download this version"
                        >
                          ⬇️
                        </button>
                        {index !== 0 && (
                          <button
                            className={styles.restoreBtn}
                            onClick={() => handleRestore(version)}
                            disabled={restoringVersionId === version.versionId}
                            title="Restore this version"
                          >
                            {restoringVersionId === version.versionId ? 'Restoring...' : '↩️ Restore'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.infoBox}>
                <strong>ℹ️ About Version History</strong>
                <ul>
                  <li>Versions are automatically created when files are uploaded or replaced</li>
                  <li>You can restore any previous version to replace the current file</li>
                  <li>Restoring a version creates a new version entry</li>
                  <li>All versions are stored on IPFS</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VersionHistory;

