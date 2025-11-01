import React, { useState, useEffect, useRef } from 'react';
import styles from '../styles/FilePreviewHover.module.css';

interface FilePreviewHoverProps {
  file: {
    id: string;
    name: string;
    type: string;
    size?: number;
    gatewayUrl: string;
    isFolder?: boolean;
  };
  position: { x: number; y: number };
  onClose: () => void;
}

const FilePreviewHover: React.FC<FilePreviewHoverProps> = ({ file, position, onClose }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Close on mouse leave
    const handleMouseLeave = () => {
      onClose();
    };

    const currentRef = previewRef.current;
    if (currentRef) {
      currentRef.addEventListener('mouseenter', () => {
        // Keep preview open when hovering over it
      });
      currentRef.addEventListener('mouseleave', handleMouseLeave);
      
      return () => {
        if (currentRef) {
          currentRef.removeEventListener('mouseleave', handleMouseLeave);
        }
      };
    }
  }, [onClose]);

  // Only show preview for images
  const isImage = file.type?.startsWith('image/');

  if (!isImage || file.isFolder) {
    return null;
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes && bytes !== 0) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  return (
    <div
      ref={previewRef}
      className={styles.previewContainer}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className={styles.previewContent}>
        {!imageError ? (
          <>
            <img
              src={file.gatewayUrl}
              alt={file.name}
              className={styles.previewImage}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              style={{ opacity: imageLoaded ? 1 : 0 }}
            />
            {!imageLoaded && (
              <div className={styles.loadingSpinner}>
                <div className={styles.spinner}></div>
              </div>
            )}
          </>
        ) : (
          <div className={styles.errorState}>
            <span className={styles.errorIcon}>🖼️</span>
            <span className={styles.errorText}>Preview unavailable</span>
          </div>
        )}
        <div className={styles.previewInfo}>
          <div className={styles.fileName} title={file.name}>{file.name}</div>
          <div className={styles.fileMeta}>
            <span>{formatFileSize(file.size)}</span>
            <span>•</span>
            <span>{file.type || 'unknown'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewHover;

