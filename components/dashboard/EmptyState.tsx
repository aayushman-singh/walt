/**
 * Empty-state panel shown when the active view has no files. Includes the
 * upload button and IPFS-sync input for the drive view. Extracted verbatim
 * from pages/dashboard.tsx.
 */

import React from 'react';
import { User } from 'firebase/auth';
import WIcon, { WIconName } from '../WIcon';
import { ActiveView } from './types';

interface EmptyStateProps {
  styles: { [key: string]: string };
  activeView: ActiveView;
  getRootProps: () => any;
  getInputProps: () => any;
  user: User;
  showToast: (message: string, type?: 'success' | 'error' | 'info', title?: string, progress?: number) => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  styles,
  activeView,
  getRootProps,
  getInputProps,
  user,
  showToast,
}) => {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>
        {activeView === 'trash' ? <WIcon name="trash" size={28} /> : activeView === 'starred' ? <WIcon name="starFill" size={28} /> : <WIcon name="folder" size={28} />}
      </span>
      <h3>
        {activeView === 'trash' ? 'Trash is empty' :
         activeView === 'starred' ? 'No starred items' :
         activeView === 'recent' ? 'No recent files' :
         'No files yet'}
      </h3>
      <p>
        {activeView === 'trash' ? 'Items you delete will appear here' :
         activeView === 'starred' ? 'Star items to find them easily' :
         activeView === 'recent' ? 'Recently accessed files will appear here' :
         'Upload files to see them here'}
      </p>
      {activeView === 'drive' && (
        <>
      <div {...getRootProps()}>
        <input {...getInputProps()} />
        <button className={styles.emptyUploadBtn}>
          Upload Files
        </button>
      </div>

      {/* Sync from IPFS URI */}
      <div className={styles.syncSection}>
        <p>Or sync files from another browser:</p>
        <input
          type="text"
          placeholder="Paste IPFS URI here (ipfs://...)"
          className={styles.syncInput}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              const uri = (e.target as HTMLInputElement).value;
              if (uri.startsWith('ipfs://') && user) {
                localStorage.setItem(`user_file_list_uri_${user.uid}`, uri);
                window.location.reload();
              } else {
                showToast('Please enter a valid IPFS URI (starts with ipfs://)', 'error');
              }
            }
          }}
        />
        <p className={styles.syncHint}>Press Enter to sync</p>
      </div>
        </>
      )}
    </div>
  );
};

export default EmptyState;
