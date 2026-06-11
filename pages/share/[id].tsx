import React, { useState, useEffect, useCallback } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import WIcon from '../../components/WIcon';
import Toast from '../../components/Toast';
import OpenGraph from '../../components/OpenGraph';
import { getBackendGatewayUrl } from '../../lib/shareUtils';
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

  const getFileFromIPFS = async (shareId: string): Promise<SharedFile | null> => {
    // This is a placeholder - in production, you'd have an API endpoint
    // that queries the file list from IPFS and finds the matching share
    
    // For now, return null - this would need backend implementation
    // to properly search across all users' file lists
    
    return null;
  };

  const recordAccess = async (shareId: string) => {
    // Would be an API call in production
  };

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

  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchSharedFile(id);
    }
  }, [id, fetchSharedFile]);

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

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <WIcon name="image" size={18} />;
    if (type.startsWith('video/')) return <WIcon name="video" size={18} />;
    if (type.startsWith('audio/')) return <WIcon name="audio" size={18} />;
    if (type.includes('pdf')) return <WIcon name="fileDoc" size={18} />;
    if (type.includes('word') || type.includes('document')) return <WIcon name="fileDoc" size={18} />;
    if (type.includes('sheet') || type.includes('excel')) return <WIcon name="sheet" size={18} />;
    if (type.includes('zip') || type.includes('rar')) return <WIcon name="archive" size={18} />;
    return <WIcon name="fileDoc" size={18} />;
  };

  const handleDownload = async () => {
    if (!file || file.shareConfig?.permission === 'viewer') {
      showToast('Download not allowed for this share link', 'error');
      return;
    }

    try {
      const backendUrl = getBackendGatewayUrl(file.ipfsUri);
      const response = await fetch(backendUrl);
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
      showToast('Download failed', 'error');
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <OpenGraph
          title="Loading... | Walt"
          description="Loading shared content..."
          url={id ? `/share/${id}` : undefined}
        />
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
        <OpenGraph
          title="Password Required | Walt"
          description="This shared content is password protected."
          url={id ? `/share/${id}` : undefined}
        />
        <div className={styles.passwordBox}>
          <div className={styles.passwordIcon}>
            <WIcon name="lock" size={18} />
          </div>
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
        <OpenGraph
          title="Not Found | Walt"
          description="This share link may have expired or been removed."
          url={id ? `/share/${id}` : undefined}
        />
        <div className={styles.error}>
          <div className={styles.errorIcon}>
            <WIcon name="warning" size={18} />
          </div>
          <h2>{error || 'Content not found'}</h2>
          <p>This share link may have expired or been removed.</p>
          <button onClick={() => router.push('/')} className={styles.homeBtn}>
            Go to Walt
          </button>
        </div>
      </div>
    );
  }

  // Generate OpenGraph image URL - use file preview if it's an image, otherwise use default
  const ogImage = file.type.startsWith('image/') && file.gatewayUrl
    ? getBackendGatewayUrl(file.ipfsUri)
    : '/opengraph.png';
  
  const fileDescription = file.isFolder
    ? `A folder shared via Walt - Decentralized Storage`
    : `${file.name} (${formatFileSize(file.size)}) shared via Walt - Decentralized Storage`;

  return (
    <div className={styles.container}>
      <OpenGraph
        title={`${file.name} | Walt`}
        description={fileDescription}
        image={ogImage}
        url={id ? `/share/${id}` : undefined}
        type="website"
      />

      <header className={styles.header}>
        <div className={styles.logo} onClick={() => router.push('/')}>
          <WIcon name="lock" size={18} className={styles.inlineIcon} />
          <span>Walt</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.sharedBadge}>
            <WIcon name="share" size={18} className={styles.inlineIcon} />
            Shared
          </span>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.fileCard}>
          <div className={styles.filePreview}>
            {file.isFolder ? (
              <div className={styles.folderIcon}>
                <WIcon name="folder" size={18} />
              </div>
            ) : file.type.startsWith('image/') ? (
              <Image src={getBackendGatewayUrl(file.ipfsUri)} alt={file.name} className={styles.image} width={800} height={600} unoptimized style={{ objectFit: 'contain' }} />
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
                {file.shareConfig?.permission === 'viewer' ? (
                  <>
                    <WIcon name="eye" size={18} className={styles.inlineIcon} />
                    View Only
                  </>
                ) : (
                  <>
                    <WIcon name="download" size={18} className={styles.inlineIcon} />
                    Can Download
                  </>
                )}
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
                    onClick={() => window.open(getBackendGatewayUrl(file.ipfsUri), '_blank')}
                  >
                    <WIcon name="eye" size={18} className={styles.inlineIcon} />
                    View File
                  </button>
                  {file.shareConfig?.permission === 'editor' && (
                    <button 
                      className={styles.actionBtn}
                      onClick={handleDownload}
                    >
                      <WIcon name="download" size={18} className={styles.inlineIcon} />
                      Download
                    </button>
                  )}
                </>
              )}
              <button 
                className={styles.actionBtn}
                onClick={() => {
                  const backendUrl = getBackendGatewayUrl(file.ipfsUri);
                  navigator.clipboard.writeText(backendUrl);
                  showToast('Link copied!', 'success');
                }}
              >
                <WIcon name="share" size={18} className={styles.inlineIcon} />
                Copy Link
              </button>
            </div>

            {file.shareConfig?.permission === 'viewer' && (
              <div className={styles.notice}>
                <WIcon name="info" size={18} className={styles.inlineIcon} />
                <span>This is a view-only share. Downloads are not permitted.</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <p>Shared via <strong>Walt</strong> - Decentralized Storage</p>
          <button onClick={() => router.push('/')} className={styles.linkBtn}>
            Try Walt →
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

