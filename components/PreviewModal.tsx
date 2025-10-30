import React from 'react';
import styles from '../styles/PreviewModal.module.css';

interface PreviewModalProps {
  isOpen: boolean;
  fileName: string;
  fileType: string;
  gatewayUrl: string;
  onClose: () => void;
}

const isImage = (type: string) => type.startsWith('image/');
const isVideo = (type: string) => type.startsWith('video/');
const isAudio = (type: string) => type.startsWith('audio/');
const isPdf = (type: string, name: string) => type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');

const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, fileName, fileType, gatewayUrl, onClose }) => {
  if (!isOpen) return null;

  const renderContent = () => {
    if (isImage(fileType)) {
      return <img src={gatewayUrl} alt={fileName} className={styles.media} />;
    }
    if (isVideo(fileType)) {
      return (
        <video controls className={styles.media}>
          <source src={gatewayUrl} type={fileType} />
        </video>
      );
    }
    if (isAudio(fileType)) {
      return (
        <audio controls className={styles.audio}>
          <source src={gatewayUrl} type={fileType} />
        </audio>
      );
    }
    if (isPdf(fileType, fileName)) {
      return (
        <iframe title={fileName} src={`${gatewayUrl}#toolbar=1&view=FitH`} className={styles.iframe} />
      );
    }
    // Fallback: open in new tab
    return (
      <div className={styles.fallback}>
        <p>Preview not available for this file type.</p>
        <a href={gatewayUrl} target="_blank" rel="noreferrer" className={styles.openBtn}>Open in new tab</a>
      </div>
    );
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title} title={fileName}>{fileName}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.content}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;

