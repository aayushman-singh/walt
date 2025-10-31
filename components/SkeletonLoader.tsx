import React from 'react';
import styles from '../styles/SkeletonLoader.module.css';

interface SkeletonLoaderProps {
  type?: 'file-card' | 'file-row' | 'text' | 'circle' | 'rect';
  width?: string | number;
  height?: string | number;
  count?: number;
  className?: string;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  type = 'rect',
  width,
  height,
  count = 1,
  className = ''
}) => {
  const style: React.CSSProperties = {
    width: width || undefined,
    height: height || undefined
  };

  const renderSkeleton = () => {
    switch (type) {
      case 'file-card':
        return (
          <div className={`${styles.fileCardSkeleton} ${className}`}>
            <div className={styles.skeletonImage}></div>
            <div className={styles.skeletonContent}>
              <div className={`${styles.skeletonText} ${styles.skeletonTitle}`}></div>
              <div className={`${styles.skeletonText} ${styles.skeletonSubtitle}`}></div>
            </div>
          </div>
        );
      
      case 'file-row':
        return (
          <div className={`${styles.fileRowSkeleton} ${className}`}>
            <div className={styles.skeletonIcon}></div>
            <div className={styles.skeletonContent}>
              <div className={`${styles.skeletonText} ${styles.skeletonTitle}`}></div>
              <div className={`${styles.skeletonText} ${styles.skeletonSubtitle}`}></div>
            </div>
            <div className={styles.skeletonActions}></div>
          </div>
        );
      
      case 'circle':
        return <div className={`${styles.skeletonCircle} ${className}`} style={style}></div>;
      
      case 'text':
        return <div className={`${styles.skeletonText} ${className}`} style={style}></div>;
      
      case 'rect':
      default:
        return <div className={`${styles.skeletonRect} ${className}`} style={style}></div>;
    }
  };

  if (count > 1) {
    return (
      <>
        {Array.from({ length: count }).map((_, index) => (
          <React.Fragment key={index}>{renderSkeleton()}</React.Fragment>
        ))}
      </>
    );
  }

  return renderSkeleton();
};

export default SkeletonLoader;

