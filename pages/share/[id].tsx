import React, { useState, useEffect, useCallback } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Toast from '../../components/Toast';
import styles from '../../styles/SharePage.module.css';

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

interface SharedFile {
  id: string;
  name: string;
  ipfsUri: string;
  gatewayUrl: string;
  timestamp: number;
  type: string;
  size?: number;
  isFolder?: boolean;
  shareConfig?: ShareConfig;
}

const SharePage: NextPage = () => {
  const router = useRouter();
  const { id } = router.query;
  
  const [file, setFile] = useState<SharedFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchSharedFile(id);
    }
  }, [id, fetchSharedFile]);

  const fetchSharedFile = useCallback(async (shareId: string) => {
    setLoading(true);
    setError('');
    
    try {
      // In a real app, this would be an API call
      // For now, we'll try to get it from localStorage/IPFS
      // This is a simplified version - in production, you'd want a backend API
      
      // Check if password is required
      const fileData = await getFileFromIPFS(shareId);
      
      if (!fileData) {
        setError('Share link not found or has expired');
        setLoading(false);
        return;
      }

      // Check if share is expired
      if (fileData.shareConfig?.expiryDate && 
          fileData.shareConfig.expiryDate < Date.now()) {
        setError('This share link has expired');
        setLoading(false);
        return;
      }

      // Check if password is required
      if (fileData.shareConfig?.password) {
        setPasswordRequired(true);
        setLoading(false);
        return;
      }

      setFile(fileData);
      // Record access (would be done via API in production)
      await recordAccess(shareId);
      
    } catch (err) {
      console.error('Failed to fetch shared file:', err);
      setError('Failed to load shared content');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!id || typeof id !== 'string') return;
    
    setVerifying(true);
    try {
      const fileData = await getFileFromIPFS(id);
      
      if (fileData?.shareConfig?.password === password) {
        setFile(fileData);
        setPasswordRequired(false);
        await recordAccess(id);
      } else {
        showToast('Incorrect password', 'error');
      }
    } catch (err) {
      console.error('Password verification failed:', err);
      showToast('Verification failed', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const getFileFromIPFS = async (shareId: string): Promise<SharedFile | null> => {
    // This is a placeholder - in production, you'd have an API endpoint
    // that queries the file list from IPFS and finds the matching share
    
    // For now, return null - this would need backend implementation
    // to properly search across all users' file lists
    
    return null;
  };

  const recordAccess = async (shareId: string) => {
    // Would be an API call in production
    console.log('Recording access for share:', shareId);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📕';
    if (type.includes('word') || type.includes('document')) return '📄';
    if (type.includes('sheet') || type.includes('excel')) return '📊';
    if (type.includes('zip') || type.includes('rar')) return '🗜️';
    return '📄';
  };

  const handleDownload = async () => {
    if (!file || file.shareConfig?.permission === 'viewer') {
      showToast('Download not allowed for this share link', 'error');
      return;
    }

    try {
      const response = await fetch(file.gatewayUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      showToast('❌ Download failed', 'error');
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <Head>
          <title>Loading... | Vault Labs</title>
        </Head>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading shared content...</p>
        </div>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className={styles.container}>
        <Head>
          <title>Password Required | Vault Labs</title>
        </Head>
        <div className={styles.passwordBox}>
          <div className={styles.passwordIcon}>🔒</div>
          <h2>Password Required</h2>
          <p>This shared content is password protected.</p>
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.passwordInput}
              autoFocus
            />
            <button 
              type="submit" 
              className={styles.submitBtn}
              disabled={verifying || !password}
            >
              {verifying ? 'Verifying...' : 'Access'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className={styles.container}>
        <Head>
          <title>Not Found | Vault Labs</title>
        </Head>
        <div className={styles.error}>
          <div className={styles.errorIcon}>⚠️</div>
          <h2>{error || 'Content not found'}</h2>
          <p>This share link may have expired or been removed.</p>
          <button onClick={() => router.push('/')} className={styles.homeBtn}>
            Go to Vault Labs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>{file.name} | Vault Labs</title>
      </Head>

      <header className={styles.header}>
        <div className={styles.logo} onClick={() => router.push('/')}>
          🔐 Vault Labs
        </div>
        <div className={styles.headerRight}>
          <span className={styles.sharedBadge}>🔗 Shared</span>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.fileCard}>
          <div className={styles.filePreview}>
            {file.isFolder ? (
              <div className={styles.folderIcon}>📁</div>
            ) : file.type.startsWith('image/') ? (
              <img src={file.gatewayUrl} alt={file.name} className={styles.image} />
            ) : (
              <div className={styles.fileIcon}>
                {getFileIcon(file.type)}
              </div>
            )}
          </div>

          <div className={styles.fileInfo}>
            <h1 className={styles.fileName}>{file.name}</h1>
            
            <div className={styles.fileMeta}>
              {!file.isFolder && <span>{formatFileSize(file.size)}</span>}
              <span>•</span>
              <span>Shared on {new Date(file.shareConfig?.createdDate || 0).toLocaleDateString()}</span>
            </div>

            <div className={styles.permissions}>
              <span className={styles.permissionBadge}>
                {file.shareConfig?.permission === 'viewer' ? '👁️ View Only' : '✏️ Can Download'}
              </span>
              {file.shareConfig?.expiryDate && (
                <span className={styles.expiryInfo}>
                  Expires: {new Date(file.shareConfig.expiryDate).toLocaleDateString()}
                </span>
              )}
            </div>

            <div className={styles.actions}>
              {!file.isFolder && (
                <>
                  <button 
                    className={styles.actionBtn + ' ' + styles.primary}
                    onClick={() => window.open(file.gatewayUrl, '_blank')}
                  >
                    👁️ View File
                  </button>
                  {file.shareConfig?.permission === 'editor' && (
                    <button 
                      className={styles.actionBtn}
                      onClick={handleDownload}
                    >
                      ⬇️ Download
                    </button>
                  )}
                </>
              )}
              <button 
                className={styles.actionBtn}
                onClick={() => navigator.clipboard.writeText(file.gatewayUrl)}
              >
                🔗 Copy Link
              </button>
            </div>

            {file.shareConfig?.permission === 'viewer' && (
              <div className={styles.notice}>
                ℹ️ This is a view-only share. Downloads are not permitted.
              </div>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <p>Shared via <strong>Vault Labs</strong> - Decentralized Storage</p>
          <button onClick={() => router.push('/')} className={styles.linkBtn}>
            Try Vault Labs →
          </button>
        </div>
      </main>

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default SharePage;

