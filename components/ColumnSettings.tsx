import React from 'react';
import styles from '../styles/ColumnSettings.module.css';

interface ColumnSettingsProps {
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (column: string) => void;
  onClose: () => void;
}

const COLUMN_LABELS: Record<string, string> = {
  name: 'Name',
  size: 'Size',
  type: 'Type',
  modified: 'Modified Date',
  pinStatus: 'Pin Status',
  tags: 'Tags',
  starStatus: 'Starred',
};

const ColumnSettings: React.FC<ColumnSettingsProps> = ({ visibleColumns, onToggleColumn, onClose }) => {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>📊 Column Settings</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.content}>
          <p className={styles.description}>Select which columns to display in list view:</p>
          
          <div className={styles.columnsList}>
            {Object.entries(COLUMN_LABELS).map(([key, label]) => (
              <label key={key} className={styles.columnItem}>
                <input
                  type="checkbox"
                  checked={visibleColumns[key] ?? true}
                  onChange={() => onToggleColumn(key)}
                  className={styles.checkbox}
                />
                <span className={styles.columnLabel}>{label}</span>
              </label>
            ))}
          </div>

          <div className={styles.actions}>
            <button
              className={styles.resetBtn}
              onClick={() => {
                Object.keys(visibleColumns).forEach(key => {
                  if (visibleColumns[key] === false) {
                    onToggleColumn(key);
                  }
                });
              }}
            >
              Show All
            </button>
            <button className={styles.closeButton} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColumnSettings;

