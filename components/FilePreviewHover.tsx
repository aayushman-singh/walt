import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import WIcon from './WIcon';
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
  const [centeredPosition, setCenteredPosition] = useState({ left: 0, top: 0 });
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Calculate centered position that stays within viewport
    const calculatePosition = () => {
      if (typeof window === 'undefined') return;
      
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const previewWidth = 400; // max-width from CSS
      const previewHeight = 500; // max-height from CSS
      
      // Center on viewport
      let left = viewportWidth / 2;
      let top = viewportHeight / 2;
      
      // Ensure preview doesn't go off screen
      const halfWidth = previewWidth / 2;
      const halfHeight = previewHeight / 2;
      
      // Clamp to viewport bounds with padding
      const padding = 20;
      left = Math.max(padding + halfWidth, Math.min(left, viewportWidth - padding - halfWidth));
      top = Math.max(padding + halfHeight, Math.min(top, viewportHeight - padding - halfHeight));
      
      setCenteredPosition({ left, top });
    };

    calculatePosition();

    // Recalculate on window resize
    const handleResize = () => calculatePosition();
    window.addEventListener('resize', handleResize);

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
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (currentRef) {
        currentRef.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
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
        left: `${centeredPosition.left}px`,
        top: `${centeredPosition.top}px`,
      }}
    >
      <div className={styles.previewContent}>
        {!imageError ? (
          <>
            <Image
              src={file.gatewayUrl}
              alt={file.name}
              className={styles.previewImage}
              width={400}
              height={400}
              unoptimized
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
            <span className={styles.errorIcon}>
              <WIcon name="image" size={44} sw={1.2} />
            </span>
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

