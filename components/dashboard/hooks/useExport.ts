/**
 * Export-all-as-ZIP flow plus its recursive folder-walk helper. Extracted
 * verbatim from pages/dashboard.tsx (handleExportAll / getAllFilesRecursively).
 */

import JSZip from 'jszip';
import { UploadedFile } from '../types';

interface UseExportParams {
  uploadedFiles: UploadedFile[];
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
}

export function useExport({ uploadedFiles, showToast }: UseExportParams) {
  const getAllFilesRecursively = (
    folderId: string | null,
    files: UploadedFile[],
    path: string = '',
  ): Array<{ file: UploadedFile; path: string }> => {
    const result: Array<{ file: UploadedFile; path: string }> = [];

    files.forEach(file => {
      if (file.parentFolderId === folderId && !file.isFolder && !file.trashed) {
        result.push({ file, path });
      }
    });

    files.forEach(folder => {
      if (folder.isFolder && folder.parentFolderId === folderId && !folder.trashed) {
        const folderPath = path ? `${path}/${folder.name}` : folder.name;
        const folderFiles = getAllFilesRecursively(folder.id, files, folderPath);
        result.push(...folderFiles);
      }
    });

    return result;
  };

  const handleExportAll = async () => {
    const nonTrashedFiles = uploadedFiles.filter(f => !f.trashed && !f.isFolder);

    if (nonTrashedFiles.length === 0) {
      showToast('No files to export', 'info');
      return;
    }

    try {
      showToast('Preparing ZIP file...', 'info');
      const zip = new JSZip();

      const allFilesWithPaths = getAllFilesRecursively(null, uploadedFiles);

      if (allFilesWithPaths.length === 0) {
        showToast('No files to export', 'info');
        return;
      }

      let processed = 0;
      const total = allFilesWithPaths.length;

      for (const { file, path } of allFilesWithPaths) {
        try {
          const response = await fetch(file.gatewayUrl);
          if (!response.ok) {
            console.warn(`Failed to fetch ${file.name}, skipping...`);
            continue;
          }
          const blob = await response.blob();
          const zipPath = path ? `${path}/${file.name}` : file.name;
          zip.file(zipPath, blob);

          processed++;
          if (processed % 10 === 0 || processed === total) {
            showToast(`Exporting... ${processed}/${total} files`, 'info');
          }
        } catch (error) {
          console.error(`Error fetching ${file.name}:`, error);
        }
      }

      showToast('Generating ZIP file...', 'info');
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vault-export-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast(`Exported ${processed} files successfully!`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Export failed. Please try again.', 'error');
    }
  };

  return { handleExportAll };
}
