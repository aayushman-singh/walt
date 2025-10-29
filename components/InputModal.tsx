import React, { useState, useEffect } from 'react';
import styles from '../styles/InputModal.module.css';

interface InputModalProps {
  isOpen: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  type?: 'text' | 'password';
  required?: boolean;
}

const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'text',
  required = true
}) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!required || value.trim()) {
      onConfirm(value.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.content}>
          {message && <p className={styles.message}>{message}</p>}
          
          <input
            type={type}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={styles.input}
            autoFocus
            required={required}
          />
          
          <div className={styles.actions}>
            <button 
              type="button"
              className={`${styles.button} ${styles.cancelButton}`}
              onClick={onCancel}
            >
              {cancelText}
            </button>
            <button 
              type="submit"
              className={`${styles.button} ${styles.confirmButton}`}
              disabled={required && !value.trim()}
            >
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InputModal;
