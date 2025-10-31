import React from 'react';
import styles from '../styles/FileDetailsPanel.module.css';

interface ActivityLogEntry {
  timestamp: number;
  action: string;
  userId?: string;
  userEmail?: string;
  details?: string;
}

interface FileDetailsPanelProps {
  isOpen: boolean;
  file: {
    id: string;
    name: string;
    type: string;
    size?: number;
    ipfsUri: string;
    gatewayUrl: string;
    isPinned?: boolean;
    pinService?: string;
    pinDate?: number;
    pinExpiry?: number;
    pinSize?: number;
    starred?: boolean;
    modifiedDate?: number;
    timestamp: number;
    activityLog?: ActivityLogEntry[];
  } | null;
  onClose: () => void;
  onDownload: () => void;
  onShare: () => void;
  onTogglePin: () => void;
}

const formatBytes = (bytes?: number) => {
  if (!bytes && bytes !== 0) return 'Unknown';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
};

const FileDetailsPanel: React.FC<FileDetailsPanelProps> = ({ isOpen, file, onClose, onDownload, onShare, onTogglePin }) => {
  if (!isOpen || !file) return null;

  const metaRows = [
    { label: 'Type', value: file.type || 'unknown' },
    { label: 'Size', value: formatBytes(file.size) },
    { label: 'Modified', value: new Date(file.modifiedDate || file.timestamp).toLocaleString() },
    { label: 'Pinned', value: file.isPinned ? `Yes${file.pinService ? ` (${file.pinService})` : ''}` : 'No' },
    { label: 'IPFS URI', value: file.ipfsUri },
    { label: 'Gateway URL', value: file.gatewayUrl },
  ];

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title} title={file.name}>{file.name}</div>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={onDownload}>⬇️ Download</button>
        <button className={styles.actionBtn} onClick={onShare}>🔗 Share</button>
        <button className={styles.actionBtn} onClick={onTogglePin}>{file.isPinned ? '📍 Unpin' : '📌 Pin'}</button>
        <a className={styles.actionBtn} href={file.gatewayUrl} target="_blank" rel="noreferrer">🔎 Open</a>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Details</div>
        <div className={styles.metaGrid}>
          {metaRows.map((row) => (
            <React.Fragment key={row.label}>
              <div className={styles.metaLabel}>{row.label}</div>
              <div className={styles.metaValue} title={String(row.value)}>{row.value}</div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Recent Activity</div>
        {file.activityLog && file.activityLog.length > 0 ? (
          <div className={styles.activityList}>
            {file.activityLog.slice(0, 10).map((entry, idx) => (
              <div key={idx} className={styles.activityItem}>
                <div className={styles.activityTime}>{new Date(entry.timestamp).toLocaleString()}</div>
                <div className={styles.activityDesc}>{entry.action}{entry.details ? ` — ${entry.details}` : ''}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No activity yet.</div>
        )}
      </div>
    </aside>
  );
};

export default FileDetailsPanel;




