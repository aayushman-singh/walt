/**
 * Grid view of files/folders. Extracted verbatim from pages/dashboard.tsx.
 * All behaviour (selection, drag/drop, hover preview, overlay buttons,
 * 3-dot menu) is preserved exactly — only relocated.
 */

import React from 'react';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { getBackendGatewayUrl } from '../../lib/shareUtils';
import FolderIcon from '@rsuite/icons/FolderFill';
import StarIcon from '@rsuite/icons/Star';
import StarOutlineIcon from '@rsuite/icons/Star';
import PinIcon from '@rsuite/icons/Pin';
import PinedIcon from '@rsuite/icons/Pined';
import TrashIcon from '@rsuite/icons/Trash';
import VisibleIcon from '@rsuite/icons/Visible';
import FileDownloadIcon from '@rsuite/icons/FileDownload';
import SearchIcon from '@rsuite/icons/Search';
import ShareRoundIcon from '@rsuite/icons/ShareRound';
import TagIcon from '@rsuite/icons/Tag';
import EditIcon from '@rsuite/icons/Edit';
import UndoIcon from '@rsuite/icons/Undo';
import CheckIcon from '@rsuite/icons/Check';
import { getFileIcon } from './FileIcon';
import { ActiveView, UploadedFile } from './types';

interface FileGridProps {
  styles: { [key: string]: string };
  filteredFiles: UploadedFile[];
  cleanupMode: boolean;
  selectedFiles: Set<string>;
  activeView: ActiveView;
  hoverTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  formatFileSize: (bytes?: number) => string;
  toggleFileSelection: (fileId: string) => void;
  handleFileClick: (file: UploadedFile) => void;
  setHoverPreviewPosition: (pos: { x: number; y: number }) => void;
  setHoverPreviewFile: (file: UploadedFile | null) => void;
  setIsDragging: (dragging: boolean) => void;
  handleFolderDrop: (folderId: string, acceptedFiles: File[]) => void;
  handleFileMove: (fileId: string, targetFolderId: string | null) => void;
  handleToggleStar: (fileId: string, event?: React.MouseEvent) => void;
  handlePinToggle: (fileId: string, file: UploadedFile, event?: React.MouseEvent) => void;
  handlePreview: (file: UploadedFile) => void;
  handleShowDetails: (file: UploadedFile) => void;
  handleDownload: (file: UploadedFile) => void;
  copyToClipboard: (text: string) => void;
  handleRename: (fileId: string) => void;
  handleDelete: (fileId: string) => void;
  handleRestore: (fileId: string) => void;
}

const FileGrid: React.FC<FileGridProps> = ({
  styles,
  filteredFiles,
  cleanupMode,
  selectedFiles,
  activeView,
  hoverTimeoutRef,
  formatFileSize,
  toggleFileSelection,
  handleFileClick,
  setHoverPreviewPosition,
  setHoverPreviewFile,
  setIsDragging,
  handleFolderDrop,
  handleFileMove,
  handleToggleStar,
  handlePinToggle,
  handlePreview,
  handleShowDetails,
  handleDownload,
  copyToClipboard,
  handleRename,
  handleDelete,
  handleRestore,
}) => {
  return (
    <div className={styles.fileGrid}>
      {filteredFiles.map((file) => {
        return (
        <div
          key={file.id}
          className={`${styles.fileCard} ${cleanupMode && selectedFiles.has(file.id) ? styles.fileCardSelected : ''}`}
          onClick={(e) => {
            if (cleanupMode) {
              e.stopPropagation();
              if (!file.isFolder) {
                toggleFileSelection(file.id);
              }
            } else if (file.isFolder) {
              handleFileClick(file);
            }
          }}
          onDoubleClick={() => {
            if (!cleanupMode && !file.isFolder) {
              handleFileClick(file);
            }
          }}
          onMouseEnter={(e) => {
            if (!file.isFolder && file.type?.startsWith('image/')) {
              // Clear any existing timeout
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }

              // Set timeout for 2+ seconds before showing preview
              hoverTimeoutRef.current = setTimeout(() => {
                // Center the preview on viewport
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                setHoverPreviewPosition({
                  x: viewportWidth / 2,
                  y: viewportHeight / 2,
                });
                setHoverPreviewFile(file);
              }, 2000);
            }
          }}
          onMouseLeave={() => {
            // Clear timeout if mouse leaves before 2 seconds
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = null;
            }
            // Small delay to allow moving to preview
            setTimeout(() => {
              setHoverPreviewFile(null);
            }, 100);
          }}
          data-folder-id={file.isFolder ? file.id : undefined}
          data-file-id={!file.isFolder ? file.id : undefined}
          draggable={!file.isFolder}
          onDragStart={(e) => {
            if (!file.isFolder) {
              e.dataTransfer.setData('text/plain', file.id);
              e.dataTransfer.effectAllowed = 'move';

              // Create custom drag image
              const dragElement = e.currentTarget as HTMLElement;
              const clone = dragElement.cloneNode(true) as HTMLElement;
              clone.style.position = 'absolute';
              clone.style.top = '-9999px';
              clone.style.width = dragElement.offsetWidth + 'px';
              clone.style.height = dragElement.offsetHeight + 'px';
              clone.style.transform = 'scale(0.8) rotate(5deg)';
              clone.style.opacity = '1.0';
              clone.style.pointerEvents = 'none';
              document.body.appendChild(clone);

              // Set the clone as the drag image
              e.dataTransfer.setDragImage(clone, dragElement.offsetWidth / 2, dragElement.offsetHeight / 2);

              // Remove clone after a short delay
              setTimeout(() => {
                document.body.removeChild(clone);
              }, 0);

              e.currentTarget.classList.add(styles.dragging);
              setIsDragging(true);
              // Prevent event from bubbling
              e.stopPropagation();
            } else {
              e.preventDefault();
            }
          }}
          onDragEnd={(e) => {
            if (!file.isFolder) {
              e.currentTarget.classList.remove(styles.dragging);
              setIsDragging(false);
            }
          }}
          onDragEnter={(e) => {
            if (file.isFolder) {
              e.preventDefault();
              e.stopPropagation();
              (e.currentTarget as HTMLElement).classList.add('dragOver');
            }
          }}
          onDragLeave={(e) => {
            if (file.isFolder) {
              // Only remove if we're actually leaving the element (not a child)
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const isOutside = e.clientX < rect.left || e.clientX >= rect.right ||
                               e.clientY < rect.top || e.clientY >= rect.bottom;
              if (isOutside) {
                (e.currentTarget as HTMLElement).classList.remove('dragOver');
              }
            }
          }}
          onDragOver={(e) => {
            if (file.isFolder) {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
            }
          }}
          onDrop={(e) => {
            if (file.isFolder) {
              e.preventDefault();
              e.stopPropagation();
              (e.currentTarget as HTMLElement).classList.remove('dragOver');

              // Check if we're dropping files from the file system
              const droppedFiles = Array.from(e.dataTransfer.files);

              if (droppedFiles.length > 0) {
                // Dropping files from file system
                handleFolderDrop(file.id, droppedFiles);
              } else {
                // Dropping a file card (moving existing file)
                const draggedFileId = e.dataTransfer.getData('text/plain');
                if (draggedFileId && draggedFileId !== file.id) {
                  handleFileMove(draggedFileId, file.id);
                }
              }
            }
          }}
        >
          {/* Circular Checkbox - Only in cleanup mode */}
          {cleanupMode && (
            <div
              className={`${styles.fileCheckbox} ${selectedFiles.has(file.id) ? styles.fileCheckboxChecked : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleFileSelection(file.id);
              }}
            >
              {selectedFiles.has(file.id) && <CheckIcon />}
            </div>
          )}

          {/* File Preview/Icon */}
          <div className={styles.filePreview}>
            {file.isFolder ? (
              <>
                <div className={styles.folderIconLarge}>
                  <FolderIcon />
                </div>
                {/* Overlay buttons for folders - hidden in cleanup mode */}
                {!cleanupMode && (
                <div className={styles.imageOverlay}>
                  <button
                    className={styles.overlayBtn + ' ' + styles.overlayBtnTopLeft}
                    onClick={(e) => handleToggleStar(file.id, e)}
                    title={file.starred ? "Unstar" : "Star"}
                  >
                    {file.starred ? <StarIcon /> : <StarOutlineIcon />}
                  </button>
                  <button
                    className={styles.overlayBtn + ' ' + styles.overlayBtnTopRight}
                    onClick={(e) => handlePinToggle(file.id, file, e)}
                    title={file.isPinned ? "Pinned - Click to unpin (file may be lost)" : "Unpinned - Click to pin (file may be lost)"}
                  >
                    {file.isPinned ? <PinedIcon /> : <PinIcon />}
                  </button>
                </div>
                )}
              </>
            ) : file.type.startsWith('image/') ? (
              <>
                <Image
                  src={file.gatewayUrl}
                  alt={file.name}
                  className={styles.fileThumbnail}
                  width={200}
                  height={200}
                  unoptimized
                  style={{ objectFit: 'cover' }}
                />
              </>
            ) : (
              <>
                <div className={styles.fileIconLarge}>
                  {getFileIcon(file.type)}
                </div>
              </>
            )}
          </div>

          {/* File Info */}
          <div className={styles.fileInfo}>
            <div className={styles.fileNameRow}>
            <h4 className={styles.fileName} title={file.name}>{file.name}</h4>
              {file.encryption && (
                <span className={styles.starredBadge} title="End-to-end encrypted">🔒</span>
              )}
              {file.starred && (
                <span className={styles.starredBadge} title="Starred"><StarIcon /></span>
              )}
            </div>
            <div className={styles.fileMeta}>
              {file.isFolder ? (
                <span>Folder</span>
              ) : (
                <>
              <span>{formatFileSize(file.size)}</span>
              <span>•</span>
                </>
              )}
              <span>{new Date(file.modifiedDate || file.timestamp).toLocaleDateString()}</span>
              {file.pinService && !file.isFolder && (
                <>
                  <span>•</span>
                  <span title="Pinning service">{file.pinService}</span>
                </>
              )}
            </div>
            {file.tags && file.tags.length > 0 && (
              <div className={styles.fileTags}>
                {file.tags.slice(0, 3).map((tag, idx) => (
                  <span key={idx} className={styles.tagBadge} title={`Tag: ${tag}`}>
                    {tag}
                  </span>
                ))}
                {file.tags.length > 3 && (
                  <span className={styles.tagBadge} title={`${file.tags.length - 3} more tags`}>
                    +{file.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* File Actions */}
          <div className={styles.fileActions}>
            {/* Star button */}
            <button
              className={styles.actionBtn}
              data-active={file.starred}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleStar(file.id, e);
              }}
              title={file.starred ? "Unstar" : "Star"}
            >
              {file.starred ? <StarIcon /> : <StarOutlineIcon />}
            </button>

            {/* Pin button */}
            <button
              className={styles.actionBtn}
              data-pinned={file.isPinned}
              onClick={(e) => {
                e.stopPropagation();
                handlePinToggle(file.id, file, e);
              }}
              title={file.isPinned ? "Pinned - Click to unpin (file may be lost)" : "Unpinned - Click to pin (file may be lost)"}
            >
              {file.isPinned ? <PinedIcon /> : <PinIcon />}
            </button>

            {/* 3-dot menu button */}
            <div className={styles.menuContainer}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={styles.moreBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  title="More actions"
                >
                  ⋮
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className={styles.userDropdownContent}>
                {activeView !== 'trash' ? (
                  <>
                    {!file.isFolder && (
                      <>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePreview(file); }}>
                          <VisibleIcon /> Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShowDetails(file); }}>
                          🧾 Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(file); }}>
                          <FileDownloadIcon /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(file.gatewayUrl, '_blank'); }}>
                          <SearchIcon /> Open in new tab
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); copyToClipboard(getBackendGatewayUrl(file.ipfsUri)); }}>
                      <ShareRoundIcon /> Share Link
                    </DropdownMenuItem>
                    <DropdownMenuItem className={styles.menuDisabled} onClick={(e) => { e.stopPropagation(); }}>
                      📋 Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem className={styles.menuDisabled} onClick={(e) => { e.stopPropagation(); }}>
                      <TagIcon /> Manage Tags
                    </DropdownMenuItem>
                    <DropdownMenuItem className={styles.menuDisabled} onClick={(e) => { e.stopPropagation(); }}>
                      📜 Version History
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRename(file.id); }}>
                      <EditIcon /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }} className={styles.menuDanger}>
                      <TrashIcon /> Trash
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRestore(file.id); }}>
                      <UndoIcon /> Restore
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }} className={styles.menuDanger}>
                      ❌ Delete Forever
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
};

export default FileGrid;
