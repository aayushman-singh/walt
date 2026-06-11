import React, { useEffect } from 'react';
import WIcon from './WIcon';
import styles from '../styles/Toast.module.css';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
  title?: string;
  progress?: number; // 0-100
}

const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'success', 
  onClose, 
  duration = 3000,
  title,
  progress
}) => {
  useEffect(() => {
    // Don't auto-close if there's a progress bar (upload in progress)
    if (progress !== undefined && progress < 100) {
      return;
    }
    
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose, progress]);

  const getIcon = () => {
    switch (type) {
      case 'success': return <WIcon name="check" size={16} sw={2.4} />;
      case 'error': return <WIcon name="close" size={16} sw={2.4} />;
      case 'info': return <WIcon name="info" size={16} />;
      default: return <WIcon name="check" size={16} sw={2.4} />;
    }
  };

  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      <span className={styles.icon}>{getIcon()}</span>
      <div className={styles.content}>
        {title && <div className={styles.title}>{title}</div>}
        <span className={styles.message}>{message}</span>
        {progress !== undefined && (
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill} 
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className={styles.progressText}>{Math.round(progress)}%</span>
          </div>
        )}
      </div>
      <button className={styles.close} onClick={onClose} aria-label="Close notification">
        <WIcon name="close" size={14} />
      </button>
    </div>
  );
};

export default Toast;

