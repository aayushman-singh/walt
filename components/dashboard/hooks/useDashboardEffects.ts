/**
 * The dashboard's small page-level effects: ref sync, cleanup-mode reset on view
 * change, column-preference load/save, auth redirect, pinning-warning toast,
 * trash auto-cleanup, folder<->URL sync, and the stuck-drag safety reset.
 * Extracted verbatim from pages/dashboard.tsx with the exact dependency arrays.
 */

import { useEffect } from 'react';
import { User } from 'firebase/auth';
import { NextRouter } from 'next/router';
import { ActiveView, UploadedFile, VisibleColumns } from '../types';

interface UseDashboardEffectsParams {
  uploadedFiles: UploadedFile[];
  uploadedFilesRef: React.MutableRefObject<UploadedFile[]>;
  activeView: ActiveView;
  cleanupMode: boolean;
  setCleanupMode: (mode: boolean) => void;
  setSelectedFiles: (files: Set<string>) => void;
  visibleColumns: VisibleColumns;
  setVisibleColumns: React.Dispatch<React.SetStateAction<VisibleColumns>>;
  loading: boolean;
  user: User | null;
  router: NextRouter;
  pinningWarning: string | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
  autoCleanupTrash: () => Promise<{ deleted: number; unpinned: number }>;
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}

export function useDashboardEffects(params: UseDashboardEffectsParams) {
  const {
    uploadedFiles,
    uploadedFilesRef,
    activeView,
    cleanupMode,
    setCleanupMode,
    setSelectedFiles,
    visibleColumns,
    setVisibleColumns,
    loading,
    user,
    router,
    pinningWarning,
    showToast,
    autoCleanupTrash,
    currentFolderId,
    setCurrentFolderId,
    isDragging,
    setIsDragging,
  } = params;

  // Keep ref in sync with uploadedFiles state
  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deactivate cleanup mode when switching views/tabs
  useEffect(() => {
    if (cleanupMode) {
      setCleanupMode(false);
      setSelectedFiles(new Set());
    }
  }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load column preferences from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vault_list_columns');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setVisibleColumns(prev => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error('Failed to load column preferences:', e);
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save column preferences to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vault_list_columns', JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (pinningWarning) {
      showToast(pinningWarning, 'error');
    }
  }, [pinningWarning]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-cleanup trash on mount and when entering trash view
  useEffect(() => {
    if (activeView === 'trash' && user && uploadedFiles.length > 0) {
      autoCleanupTrash().catch(console.error);
    }
  }, [activeView, user, uploadedFiles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle URL navigation for folders
  useEffect(() => {
    if (!router.isReady || !user) return;

    const { folder } = router.query;

    if (folder === 'root' || folder === undefined) {
      setCurrentFolderId(null);
    } else if (typeof folder === 'string') {
      const folderExists = uploadedFiles.some(f => f.id === folder && f.isFolder);
      if (folderExists) {
        setCurrentFolderId(folder);
      } else {
        router.replace('/dashboard?folder=root');
      }
    }
  }, [router.isReady, router.query.folder, uploadedFiles, user, setCurrentFolderId, router]);

  // Update URL when folder changes
  useEffect(() => {
    if (!router.isReady) return;

    const currentFolder = router.query.folder;
    const newFolder = currentFolderId || 'root';

    if (currentFolder !== newFolder) {
      router.replace(`/dashboard?folder=${newFolder}`, undefined, { shallow: true });
    }
  }, [currentFolderId, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety mechanism: reset dragging state if drag seems stuck
  useEffect(() => {
    if (isDragging) {
      const timeout = setTimeout(() => {
        setIsDragging(false);
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [isDragging]); // eslint-disable-line react-hooks/exhaustive-deps
}
