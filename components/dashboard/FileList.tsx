/**
 * List view of files/folders. Extracted verbatim from pages/dashboard.tsx.
 * Column visibility, selection, and the 3-dot menu behaviour are preserved exactly.
 */

import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { getBackendGatewayUrl } from '../../lib/shareUtils';
import { getFileIcon } from './FileIcon';
import WIcon, { WIconName } from '../WIcon';
import { ActiveView, UploadedFile, VisibleColumns } from './types';

interface FileListProps {
  styles: { [key: string]: string };
  filteredFiles: UploadedFile[];
  cleanupMode: boolean;
  selectedFiles: Set<string>;
  activeView: ActiveView;
  visibleColumns: VisibleColumns;
  formatFileSize: (bytes?: number) => string;
  toggleFileSelection: (fileId: string) => void;
  handleFileClick: (file: UploadedFile) => void;
  handlePreview: (file: UploadedFile) => void;
  handleShowDetails: (file: UploadedFile) => void;
  handleDownload: (file: UploadedFile) => void;
  copyToClipboard: (text: string) => void;
  handleRename: (fileId: string) => void;
  handleDelete: (fileId: string) => void;
  handleRestore: (fileId: string) => void;
}

const FileList: React.FC<FileListProps> = ({
  styles,
  filteredFiles,
  cleanupMode,
  selectedFiles,
  activeView,
  visibleColumns,
  formatFileSize,
  toggleFileSelection,
  handleFileClick,
  handlePreview,
  handleShowDetails,
  handleDownload,
  copyToClipboard,
  handleRename,
  handleDelete,
  handleRestore,
}) => {
  return (
    <div className={styles.fileList}>
      {/* Column Headers */}
      <div className={styles.listHeader}>
        {visibleColumns.name && <div className={styles.listColumn} style={{ flex: '2' }}>Name</div>}
        {visibleColumns.size && <div className={styles.listColumn} style={{ flex: '1' }}>Size</div>}
        {visibleColumns.type && <div className={styles.listColumn} style={{ flex: '1' }}>Type</div>}
        {visibleColumns.modified && <div className={styles.listColumn} style={{ flex: '1' }}>Modified</div>}
        {visibleColumns.pinStatus && <div className={styles.listColumn} style={{ flex: '0.5' }}>Pin</div>}
        {visibleColumns.tags && <div className={styles.listColumn} style={{ flex: '1.5' }}>Tags</div>}
        {visibleColumns.starStatus && <div className={styles.listColumn} style={{ flex: '0.5' }}><WIcon name="starFill" size={16} /></div>}
        <div className={styles.listColumn} style={{ flex: '0.5' }}>Actions</div>
      </div>

      {/* File Rows */}
      {filteredFiles.map((file) => (
        <div
          key={file.id}
          className={`${styles.fileRow} ${cleanupMode && selectedFiles.has(file.id) ? styles.fileRowSelected : ''}`}
          onClick={(e) => {
            if (cleanupMode) {
              e.stopPropagation();
              toggleFileSelection(file.id);
            } else if (file.isFolder) {
              handleFileClick(file);
            }
          }}
          onDoubleClick={() => {
            if (!cleanupMode && !file.isFolder) {
              handleFileClick(file);
            }
          }}
          data-folder-id={file.isFolder ? file.id : undefined}
          data-file-id={!file.isFolder ? file.id : undefined}
        >
          {/* Name Column */}
          {visibleColumns.name && (
            <div className={styles.listColumn} style={{ flex: '2' }}>
              {/* Circular Checkbox - Only in cleanup mode */}
              {cleanupMode && (
                <div
                  className={`${styles.fileCheckbox} ${styles.fileCheckboxList} ${selectedFiles.has(file.id) ? styles.fileCheckboxChecked : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFileSelection(file.id);
                  }}
                >
                  {selectedFiles.has(file.id) && <WIcon name="check" size={16} />}
                </div>
              )}
              <div className={styles.fileIconSmall}>
                {file.isFolder ? <WIcon name="folder" size={16} /> : getFileIcon(file.type)}
              </div>
              <span className={styles.fileNameList} title={file.name}>{file.name}</span>
              {file.encryption && (
                <span title="End-to-end encrypted" style={{ marginLeft: '6px', display: 'inline-flex', alignItems: 'center', color: 'var(--accent)' }}><WIcon name="lock" size={14} /></span>
              )}
            </div>
          )}

          {/* Size Column */}
          {visibleColumns.size && (
            <div className={styles.listColumn} style={{ flex: '1' }}>
              {file.isFolder ? '—' : formatFileSize(file.size)}
            </div>
          )}

          {/* Type Column */}
          {visibleColumns.type && (
            <div className={styles.listColumn} style={{ flex: '1' }}>
              {file.isFolder ? 'Folder' : file.type || 'unknown'}
            </div>
          )}

          {/* Modified Column */}
          {visibleColumns.modified && (
            <div className={styles.listColumn} style={{ flex: '1' }}>
              {new Date(file.modifiedDate || file.timestamp).toLocaleDateString()}
            </div>
          )}

          {/* Pin Status Column */}
          {visibleColumns.pinStatus && (
            <div className={styles.listColumn} style={{ flex: '0.5' }}>
              {!file.isFolder && (file.isPinned ? <WIcon name="pinFilled" size={16} /> : <WIcon name="pin" size={16} />)}
            </div>
          )}

          {/* Tags Column */}
          {visibleColumns.tags && (
            <div className={styles.listColumn} style={{ flex: '1.5' }}>
              {file.tags && file.tags.length > 0 ? (
                <div className={styles.tagsListInline}>
                  {file.tags.slice(0, 2).map((tag, idx) => (
                    <span key={idx} className={styles.tagBadgeSmall}>{tag}</span>
                  ))}
                  {file.tags.length > 2 && <span className={styles.tagBadgeSmall}>+{file.tags.length - 2}</span>}
                </div>
              ) : '—'}
            </div>
          )}

          {/* Star Status Column - hidden for folders in cleanup mode */}
          {visibleColumns.starStatus && !(cleanupMode && file.isFolder) && (
            <div className={styles.listColumn} style={{ flex: '0.5' }}>
              {file.starred ? <WIcon name="starFill" size={16} /> : <WIcon name="star" size={16} />}
            </div>
          )}

          {/* Actions Column */}
          <div className={styles.listColumn} style={{ flex: '0.5' }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={styles.moreBtn}
                  onClick={(e) => e.stopPropagation()}
                  title="More actions"
                >
                  <WIcon name="dots" size={18} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={styles.userDropdownContent}>
                {activeView !== 'trash' ? (
                  <>
                    {!file.isFolder && (
                      <>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePreview(file); }}>
                          <WIcon name="eye" size={16} /> Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShowDetails(file); }}>
                          <WIcon name="fileDoc" size={16} /> Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(file); }}>
                          <WIcon name="download" size={16} /> Download
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); copyToClipboard(getBackendGatewayUrl(file.ipfsUri)); }}>
                      <WIcon name="share" size={16} /> Share Link
                    </DropdownMenuItem>
                    <DropdownMenuItem className={styles.menuDisabled} onClick={(e) => { e.stopPropagation(); }}>
                      <WIcon name="copy" size={16} /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem className={styles.menuDisabled} onClick={(e) => { e.stopPropagation(); }}>
                      <WIcon name="tag" size={16} /> Manage Tags
                    </DropdownMenuItem>
                    <DropdownMenuItem className={styles.menuDisabled} onClick={(e) => { e.stopPropagation(); }}>
                      <WIcon name="history" size={16} /> Version History
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRename(file.id); }}>
                      <WIcon name="edit" size={16} /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }} className={styles.menuDanger}>
                      <WIcon name="trash" size={16} /> Trash
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRestore(file.id); }}>
                      <WIcon name="history" size={16} /> Restore
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }} className={styles.menuDanger}>
                      <WIcon name="trash" size={16} /> Delete Forever
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FileList;
