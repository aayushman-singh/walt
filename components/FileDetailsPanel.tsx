import React, { useState } from 'react';
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
    customProperties?: Record<string, string>;
  } | null;
  onClose: () => void;
  onDownload: () => void;
  onShare: () => void;
  onTogglePin: () => void;
  onUpdateProperties?: (properties: Record<string, string>) => Promise<void>;
}

const formatBytes = (bytes?: number) => {
  if (!bytes && bytes !== 0) return 'Unknown';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
};

const FileDetailsPanel: React.FC<FileDetailsPanelProps> = ({ 
  isOpen, 
  file, 
  onClose, 
  onDownload, 
  onShare, 
  onTogglePin,
  onUpdateProperties 
}) => {
  const [editingProperties, setEditingProperties] = useState(false);
  const [propertyKey, setPropertyKey] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [properties, setProperties] = useState<Record<string, string>>(file?.customProperties || {});

  // Update local state when file changes
  React.useEffect(() => {
    if (file?.customProperties) {
      setProperties(file.customProperties);
    } else {
      setProperties({});
    }
  }, [file?.customProperties]);

  if (!isOpen || !file) return null;

  const handleAddProperty = async () => {
    if (!propertyKey.trim() || !propertyValue.trim()) return;
    if (!onUpdateProperties) return;

    const updated = { ...properties, [propertyKey.trim()]: propertyValue.trim() };
    await onUpdateProperties(updated);
    setPropertyKey('');
    setPropertyValue('');
    setEditingProperties(false);
  };

  const handleDeleteProperty = async (key: string) => {
    if (!onUpdateProperties) return;

    const updated = { ...properties };
    delete updated[key];
    await onUpdateProperties(updated);
  };

  const handleUpdateProperty = async (key: string, value: string) => {
    if (!onUpdateProperties) return;

    const updated = { ...properties, [key]: value };
    await onUpdateProperties(updated);
  };

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
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Custom Properties</div>
          {!editingProperties && (
            <button 
              className={styles.addBtn}
              onClick={() => setEditingProperties(true)}
              title="Add custom property"
            >
              + Add
            </button>
          )}
        </div>
        
        {editingProperties ? (
          <div className={styles.propertyEditor}>
            <div className={styles.propertyInputRow}>
              <input
                type="text"
                placeholder="Property name"
                value={propertyKey}
                onChange={(e) => setPropertyKey(e.target.value)}
                className={styles.propertyInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddProperty();
                  } else if (e.key === 'Escape') {
                    setEditingProperties(false);
                    setPropertyKey('');
                    setPropertyValue('');
                  }
                }}
              />
              <input
                type="text"
                placeholder="Property value"
                value={propertyValue}
                onChange={(e) => setPropertyValue(e.target.value)}
                className={styles.propertyInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddProperty();
                  } else if (e.key === 'Escape') {
                    setEditingProperties(false);
                    setPropertyKey('');
                    setPropertyValue('');
                  }
                }}
              />
              <button
                className={styles.saveBtn}
                onClick={handleAddProperty}
                disabled={!propertyKey.trim() || !propertyValue.trim()}
              >
                ✓
              </button>
              <button
                className={styles.cancelBtn}
                onClick={() => {
                  setEditingProperties(false);
                  setPropertyKey('');
                  setPropertyValue('');
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ) : null}

        {Object.keys(properties).length > 0 ? (
          <div className={styles.propertiesList}>
            {Object.entries(properties).map(([key, value]) => (
              <PropertyRow
                key={key}
                propertyKey={key}
                propertyValue={value}
                onUpdate={(newValue) => handleUpdateProperty(key, newValue)}
                onDelete={() => handleDeleteProperty(key)}
              />
            ))}
          </div>
        ) : (
          !editingProperties && (
            <div className={styles.empty}>No custom properties. Click "Add" to create one.</div>
          )
        )}
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

interface PropertyRowProps {
  propertyKey: string;
  propertyValue: string;
  onUpdate: (value: string) => void;
  onDelete: () => void;
}

const PropertyRow: React.FC<PropertyRowProps> = ({ propertyKey, propertyValue, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(propertyValue);

  React.useEffect(() => {
    setValue(propertyValue);
  }, [propertyValue]);

  const handleSave = () => {
    if (value.trim() && value !== propertyValue) {
      onUpdate(value);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setValue(propertyValue);
    setIsEditing(false);
  };

  return (
    <div className={styles.propertyRow}>
      <div className={styles.propertyKey}>{propertyKey}</div>
      {isEditing ? (
        <div className={styles.propertyEdit}>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={styles.propertyInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              } else if (e.key === 'Escape') {
                handleCancel();
              }
            }}
            onBlur={handleSave}
            autoFocus
          />
          <button className={styles.saveBtn} onClick={handleSave} title="Save">✓</button>
          <button className={styles.cancelBtn} onClick={handleCancel} title="Cancel">✕</button>
        </div>
      ) : (
        <div className={styles.propertyValueRow}>
          <span className={styles.propertyValue} onClick={() => setIsEditing(true)} title="Click to edit">
            {propertyValue}
          </span>
          <button 
            className={styles.deleteBtn} 
            onClick={onDelete}
            title="Delete property"
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  );
};

export default FileDetailsPanel;
