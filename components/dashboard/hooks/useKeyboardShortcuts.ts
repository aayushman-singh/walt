/**
 * Global keyboard shortcuts for the dashboard (Google-Drive-style). Extracted
 * verbatim from pages/dashboard.tsx, including the exact dependency array.
 */

import { useEffect } from 'react';
import { ErrorHandler } from '../../../lib/errorHandler';
import {
  ActiveView,
  ConfirmationModalState,
  InputModalState,
  UploadedFile,
  ViewMode,
} from '../types';

interface UseKeyboardShortcutsParams {
  styles: { [key: string]: string };
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  showFilters: boolean;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  setViewMode: (mode: ViewMode) => void;
  setShowSuggestions: (show: boolean) => void;
  setCurrentFolderId: (id: string | null) => void;
  currentFolderId: string | null;
  createFolder: (name: string, parentFolderId: string | null) => Promise<boolean>;
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
  confirmationModal: ConfirmationModalState;
  setConfirmationModal: React.Dispatch<React.SetStateAction<ConfirmationModalState>>;
  inputModal: InputModalState;
  setInputModal: React.Dispatch<React.SetStateAction<InputModalState>>;
  shareModalFile: UploadedFile | null;
  setShareModalFile: (file: UploadedFile | null) => void;
}

export function useKeyboardShortcuts(params: UseKeyboardShortcutsParams) {
  const {
    styles,
    searchTerm,
    setSearchTerm,
    showFilters,
    activeView,
    setActiveView,
    theme,
    setTheme,
    setViewMode,
    setShowSuggestions,
    setCurrentFolderId,
    currentFolderId,
    createFolder,
    showToast,
    confirmationModal,
    setConfirmationModal,
    inputModal,
    setInputModal,
    shareModalFile,
    setShareModalFile,
  } = params;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs, textareas, or when modals are open
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || confirmationModal.isOpen || inputModal.isOpen || shareModalFile) {
        // Allow Escape to close modals
        if (e.key === 'Escape' && (confirmationModal.isOpen || inputModal.isOpen || shareModalFile)) {
          if (shareModalFile) {
            setShareModalFile(null);
          } else if (inputModal.isOpen) {
            setInputModal({ ...inputModal, isOpen: false });
          } else if (confirmationModal.isOpen) {
            setConfirmationModal({ ...confirmationModal, isOpen: false });
          }
        }
        return;
      }

      // Ctrl+K or Cmd+K or / - Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector(`.${styles.searchInput}`) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      } else if (e.key === '/' && !searchTerm) {
        e.preventDefault();
        const searchInput = document.querySelector(`.${styles.searchInput}`) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
      // Escape - Clear search, close menus
      else if (e.key === 'Escape') {
        if (searchTerm) {
          setSearchTerm('');
          setShowSuggestions(false);
        }
        // Dropdowns will close automatically via onOpenChange
      }
      // Ctrl+N or Cmd+N - New folder (when in drive view)
      else if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (activeView === 'drive') {
          setInputModal({
            isOpen: true,
            title: 'Create Folder',
            message: 'Enter folder name:',
            placeholder: 'Folder name',
            defaultValue: '',
            onConfirm: async (folderName: string) => {
              if (folderName.trim()) {
                const success = await createFolder(folderName.trim(), currentFolderId);
                if (success) {
                  showToast('Folder created successfully', 'success');
                } else {
                  const appError = ErrorHandler.createAppError(new Error('Failed to create folder'));
          showToast(appError.userMessage, 'error');
                }
                setInputModal({ isOpen: false, title: '', message: '', placeholder: '', defaultValue: '', onConfirm: async () => {} });
              }
            }
          });
        }
      }
      // Ctrl+, or Cmd+, - Toggle theme
      else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setTheme(theme === 'light' ? 'dark' : 'light');
      }
      // 1 - My Drive
      else if (e.key === '1' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveView('drive');
        setCurrentFolderId(null);
      }
      // 2 - Recent
      else if (e.key === '2' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveView('recent');
      }
      // 3 - Starred
      else if (e.key === '3' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveView('starred');
      }
      // 4 - Trash
      else if (e.key === '4' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveView('trash');
      }
      // g then v - Grid view
      else if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        const handleNextKey = (nextEvent: KeyboardEvent) => {
          if (nextEvent.key === 'v' || nextEvent.key === 'V') {
            e.preventDefault();
            setViewMode('grid');
          } else if (nextEvent.key === 'l' || nextEvent.key === 'L') {
            e.preventDefault();
            setViewMode('list');
          }
          document.removeEventListener('keydown', handleNextKey);
        };
        document.addEventListener('keydown', handleNextKey, { once: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchTerm, showFilters, activeView, theme, confirmationModal.isOpen, inputModal.isOpen, shareModalFile]); // eslint-disable-line react-hooks/exhaustive-deps
}
