/**
 * Reusable progress panel used by the upload, bulk-trash, and permanent-delete
 * flows. The three originals in pages/dashboard.tsx were byte-identical except
 * for the heading text and the close handler, so they collapse into this one
 * component without any behaviour change.
 */

import React from 'react';
import CheckIcon from '@rsuite/icons/Check';
import CloseIcon from '@rsuite/icons/Close';
import { UploadProgress } from './types';

interface ProgressPanelProps {
  styles: { [key: string]: string };
  queue: UploadProgress[];
  heading: string;
  onClose: () => void;
}

const ProgressPanel: React.FC<ProgressPanelProps> = ({ styles, queue, heading, onClose }) => {
  return (
    <div className={styles.uploadPanel}>
      <div className={styles.uploadHeader}>
        <h4>{heading}</h4>
        <button onClick={onClose} className={styles.closeUploadPanel}><CloseIcon /></button>
      </div>
      <div className={styles.uploadList}>
        {queue.map((item, index) => (
          <div key={index} className={styles.uploadItem}>
            <div className={styles.uploadItemInfo}>
              <span className={styles.uploadItemName}>{item.name}</span>
              <span className={styles.uploadItemProgress}>
                {item.status === 'complete' ? <CheckIcon /> : item.status === 'error' ? <CloseIcon /> : `${Math.round(item.progress)}%`}
              </span>
            </div>
            <div className={styles.progressBar}>
              <div
                className={`${styles.progressFill} ${styles[item.status]}`}
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProgressPanel;
