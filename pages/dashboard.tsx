import React, { useState, useEffect } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useStorageUpload } from '@thirdweb-dev/react';
import { useDropzone } from 'react-dropzone';
import styles from '../styles/Dashboard.module.css';

interface UploadedFile {
  name: string;
  ipfsUri: string;
  gatewayUrl: string;
  timestamp: number;
  type: string;
  size?: number;
}

const Dashboard: NextPage = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();
  const { mutateAsync: upload } = useStorageUpload();

  // Load uploaded files from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('vaultlabs_uploads');
    if (saved) {
      setUploadedFiles(JSON.parse(saved));
    }
  }, []);

  // Save to localStorage whenever uploadedFiles changes
  useEffect(() => {
    if (uploadedFiles.length > 0) {
      localStorage.setItem('vaultlabs_uploads', JSON.stringify(uploadedFiles));
    } else {
      localStorage.removeItem('vaultlabs_uploads');
    }
  }, [uploadedFiles]);

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setIsUploading(true);
    try {
      const uris = await upload({ data: acceptedFiles });
      console.log('Upload successful:', uris);

      const newFiles: UploadedFile[] = acceptedFiles.map((file, index) => ({
        name: file.name,
        ipfsUri: uris[index],
        gatewayUrl: uris[index].replace('ipfs://', 'https://ipfs.io/ipfs/'),
        timestamp: Date.now(),
        type: file.type || 'unknown',
        size: file.size
      }));

      setUploadedFiles(prev => [...newFiles, ...prev]);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    multiple: true,
    noClick: false
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Link copied to clipboard!');
  };

  const deleteFile = (index: number) => {
    if (confirm('Remove this file from your dashboard?')) {
      setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    }
  };

  const clearAll = () => {
    if (confirm('Clear all files from your dashboard?')) {
      setUploadedFiles([]);
      localStorage.removeItem('vaultlabs_uploads');
    }
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

  const filteredFiles = uploadedFiles.filter(file => 
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.logoBtn} onClick={() => router.push('/')}>
            <span className={styles.logo}>🔐 Vault Labs</span>
          </button>
          <div className={styles.searchBar}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Search in Drive"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.homeBtn} onClick={() => router.push('/')}>
            Home
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div {...getRootProps()} className={styles.uploadSection}>
            <input {...getInputProps()} />
            <button className={styles.newButton} disabled={isUploading}>
              <span className={styles.plusIcon}>+</span>
              {isUploading ? 'Uploading...' : 'New'}
            </button>
          </div>
          
          <nav className={styles.sidebarNav}>
            <div className={styles.navItem + ' ' + styles.active}>
              <span className={styles.navIcon}>📁</span>
              <span>My Drive</span>
            </div>
            <div className={styles.navItem}>
              <span className={styles.navIcon}>⏰</span>
              <span>Recent</span>
            </div>
            <div className={styles.navItem}>
              <span className={styles.navIcon}>⭐</span>
              <span>Starred</span>
            </div>
            <div className={styles.navItem}>
              <span className={styles.navIcon}>🗑️</span>
              <span>Trash</span>
            </div>
          </nav>

          <div className={styles.storageInfo}>
            <div className={styles.storageText}>
              <span>{uploadedFiles.length} files stored</span>
            </div>
          </div>
        </aside>

        {/* File Display Area */}
        <main className={styles.fileArea}>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <h2>My Drive</h2>
            </div>
            <div className={styles.toolbarRight}>
              <button 
                className={viewMode === 'grid' ? styles.viewBtnActive : styles.viewBtn}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                ▦
              </button>
              <button 
                className={viewMode === 'list' ? styles.viewBtnActive : styles.viewBtn}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                ☰
              </button>
              {uploadedFiles.length > 0 && (
                <button className={styles.clearBtn} onClick={clearAll}>
                  Clear All
                </button>
              )}
            </div>
          </div>

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
          {filteredFiles.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>📂</span>
              <h3>No files yet</h3>
              <p>Upload files to see them here</p>
              <div {...getRootProps()}>
                <input {...getInputProps()} />
                <button className={styles.emptyUploadBtn}>
                  Upload Files
                </button>
              </div>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? styles.fileGrid : styles.fileList}>
              {filteredFiles.map((file, index) => (
                <div key={index} className={viewMode === 'grid' ? styles.fileCard : styles.fileRow}>
                  {/* File Preview/Icon */}
                  <div className={styles.filePreview}>
                    {file.type.startsWith('image/') ? (
                      <img src={file.gatewayUrl} alt={file.name} className={styles.fileThumbnail} />
                    ) : (
                      <div className={styles.fileIconLarge}>
                        {getFileIcon(file.type)}
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className={styles.fileInfo}>
                    <h4 className={styles.fileName} title={file.name}>{file.name}</h4>
                    <div className={styles.fileMeta}>
                      <span>{formatFileSize(file.size)}</span>
                      <span>•</span>
                      <span>{new Date(file.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* File Actions */}
                  <div className={styles.fileActions}>
                    <button 
                      className={styles.actionBtn}
                      onClick={() => window.open(file.gatewayUrl, '_blank')}
                      title="Open file"
                    >
                      👁️
                    </button>
                    <button 
                      className={styles.actionBtn}
                      onClick={() => copyToClipboard(file.gatewayUrl)}
                      title="Copy link"
                    >
                      🔗
                    </button>
                    <button 
                      className={styles.actionBtn}
                      onClick={() => copyToClipboard(file.ipfsUri)}
                      title="Copy IPFS URI"
                    >
                      📋
                    </button>
                    <button 
                      className={styles.actionBtn + ' ' + styles.deleteAction}
                      onClick={() => deleteFile(index)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;

