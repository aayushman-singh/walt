import React, { useState, useEffect } from 'react';
import styles from '../styles/ShareModal.module.css';

interface ShareConfig {
  shareId: string;
  enabled: boolean;
  createdDate: number;
  createdBy: string;
  permission: 'viewer' | 'editor';
  expiryDate?: number;
  password?: string;
  accessCount?: number;
  lastAccessedDate?: number;
}

interface ShareModalProps {
  fileName: string;
  isOpen: boolean;
  onClose: () => void;
  onShare: (permission: 'viewer' | 'editor', expiryDate?: number, password?: string) => Promise<string | null>;
  onDisableShare: () => Promise<boolean>;
  existingShare?: ShareConfig;
  isFolder?: boolean;
}

const ShareModal: React.FC<ShareModalProps> = ({
  fileName,
  isOpen,
  onClose,
  onShare,
  onDisableShare,
  existingShare,
  isFolder = false
}) => {
  const [permission, setPermission] = useState<'viewer' | 'editor'>('viewer');
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (existingShare?.enabled) {
      setPermission(existingShare.permission);
      setShareLink(getShareLink(existingShare.shareId));
      
      if (existingShare.expiryDate) {
        setExpiryEnabled(true);
        const daysLeft = Math.ceil((existingShare.expiryDate - Date.now()) / (1000 * 60 * 60 * 24));
        setExpiryDays(Math.max(1, daysLeft));
      }
      
      if (existingShare.password) {
        setPasswordEnabled(true);
      }
    }
  }, [existingShare]);

  const getShareLink = (shareId: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/share/${shareId}`;
    }
    return '';
  };

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const expiryDate = expiryEnabled 
        ? Date.now() + (expiryDays * 24 * 60 * 60 * 1000)
        : undefined;
      
      const pwd = passwordEnabled && password ? password : undefined;
      
      const shareId = await onShare(permission, expiryDate, pwd);
      
      if (shareId) {
        setShareLink(getShareLink(shareId));
      }
    } catch (error) {
      console.error('Share failed:', error);
      // Note: Error handling should be done by parent component
      throw error;
    } finally {
      setIsSharing(false);
    }
  };

  const handleDisableShare = async () => {
    if (confirm('Remove share link? This will make the file inaccessible to anyone with the link.')) {
      setIsSharing(true);
      try {
        await onDisableShare();
        setShareLink('');
      } catch (error) {
        console.error('Disable share failed:', error);
        // Note: Error handling should be done by parent component
        throw error;
      } finally {
        setIsSharing(false);
      }
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const isShared = existingShare?.enabled && shareLink;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Share &quot;{fileName}&quot;</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          {isShared ? (
            <>
              {/* Existing Share */}
              <div className={styles.shareActive}>
                <div className={styles.shareInfo}>
                  <span className={styles.shareIcon}>🔗</span>
                  <div>
                    <div className={styles.shareLabel}>Share link is active</div>
                    <div className={styles.shareMeta}>
                      Permission: <strong>{permission}</strong>
                      {existingShare.accessCount !== undefined && (
                        <> • Accessed: <strong>{existingShare.accessCount} times</strong></>
                      )}
                    </div>
                    {existingShare.expiryDate && (
                      <div className={styles.shareExpiry}>
                        Expires: {new Date(existingShare.expiryDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.linkBox}>
                  <input 
                    type="text" 
                    value={shareLink} 
                    readOnly 
                    className={styles.linkInput}
                  />
                  <button 
                    className={styles.copyBtn}
                    onClick={copyLink}
                  >
                    {copied ? '✓ Copied!' : '📋 Copy'}
                  </button>
                </div>

                <button 
                  className={styles.disableBtn}
                  onClick={handleDisableShare}
                  disabled={isSharing}
                >
                  🔒 Disable Sharing
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Create New Share */}
              <div className={styles.section}>
                <label className={styles.label}>Permission Level</label>
                <select 
                  className={styles.select}
                  value={permission}
                  onChange={(e) => setPermission(e.target.value as 'viewer' | 'editor')}
                >
                  <option value="viewer">👁️ Viewer - Can view only</option>
                  <option value="editor">✏️ Editor - Can view and download</option>
                </select>
                <p className={styles.hint}>
                  {permission === 'viewer' 
                    ? 'Viewers can see the file but cannot download it'
                    : 'Editors can view and download the file'}
                </p>
              </div>

              <div className={styles.section}>
                <label className={styles.checkbox}>
                  <input 
                    type="checkbox"
                    checked={expiryEnabled}
                    onChange={(e) => setExpiryEnabled(e.target.checked)}
                  />
                  <span>Set expiration date</span>
                </label>
                {expiryEnabled && (
                  <div className={styles.expiryInput}>
                    <input 
                      type="number"
                      min="1"
                      max="365"
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(parseInt(e.target.value) || 1)}
                      className={styles.numberInput}
                    />
                    <span>days from now</span>
                  </div>
                )}
              </div>

              <div className={styles.section}>
                <label className={styles.checkbox}>
                  <input 
                    type="checkbox"
                    checked={passwordEnabled}
                    onChange={(e) => setPasswordEnabled(e.target.checked)}
                  />
                  <span>Password protect</span>
                </label>
                {passwordEnabled && (
                  <input 
                    type="text"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={styles.textInput}
                  />
                )}
              </div>

              <div className={styles.warning}>
                ⚠️ Anyone with the link will be able to {permission === 'viewer' ? 'view' : 'view and download'} this {isFolder ? 'folder' : 'file'}.
              </div>

              <button 
                className={styles.shareBtn}
                onClick={handleShare}
                disabled={isSharing || (passwordEnabled && !password)}
              >
                {isSharing ? '⏳ Creating...' : '🔗 Create Share Link'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareModal;

