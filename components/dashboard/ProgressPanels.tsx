/**
 * Renders the three bottom-right progress panels (upload, bulk move-to-trash,
 * permanent delete). Each computes its heading from queue state exactly as the
 * originals in pages/dashboard.tsx did.
 */

import React from 'react';
import ProgressPanel from './ProgressPanel';
import { UploadProgress } from './types';

interface ProgressPanelsProps {
  styles: { [key: string]: string };
  uploadQueue: UploadProgress[];
  setUploadQueue: (q: UploadProgress[]) => void;
  uploadCompleteTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  bulkOperationQueue: UploadProgress[];
  setBulkOperationQueue: (q: UploadProgress[]) => void;
  bulkOperationTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  permanentDeleteQueue: UploadProgress[];
  setPermanentDeleteQueue: (q: UploadProgress[]) => void;
  permanentDeleteTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

const ProgressPanels: React.FC<ProgressPanelsProps> = ({
  styles,
  uploadQueue,
  setUploadQueue,
  uploadCompleteTimeoutRef,
  bulkOperationQueue,
  setBulkOperationQueue,
  bulkOperationTimeoutRef,
  permanentDeleteQueue,
  setPermanentDeleteQueue,
  permanentDeleteTimeoutRef,
}) => {
  return (
    <>
      {/* Upload Progress Panel */}
      {uploadQueue.length > 0 && (() => {
        const allComplete = uploadQueue.every(item => item.status === 'complete' || item.status === 'error');
        const completedCount = uploadQueue.filter(item => item.status === 'complete').length;

        return (
          <ProgressPanel
            styles={styles}
            queue={uploadQueue}
            heading={
              allComplete
                ? `${completedCount} upload${completedCount !== 1 ? 's' : ''} complete`
                : `Uploading ${uploadQueue.length} file${uploadQueue.length > 1 ? 's' : ''}`
            }
            onClose={() => {
              if (uploadCompleteTimeoutRef.current) {
                clearTimeout(uploadCompleteTimeoutRef.current);
                uploadCompleteTimeoutRef.current = null;
              }
              setUploadQueue([]);
            }}
          />
        );
      })()}

      {/* Bulk Operation Progress Panel */}
      {bulkOperationQueue.length > 0 && (() => {
        const allComplete = bulkOperationQueue.every(item => item.status === 'complete' || item.status === 'error');
        const completedCount = bulkOperationQueue.filter(item => item.status === 'complete').length;

        return (
          <ProgressPanel
            styles={styles}
            queue={bulkOperationQueue}
            heading={
              allComplete
                ? `${completedCount} file${completedCount !== 1 ? 's' : ''} moved to trash`
                : `Moving ${bulkOperationQueue.length} file${bulkOperationQueue.length > 1 ? 's' : ''} to trash`
            }
            onClose={() => {
              if (bulkOperationTimeoutRef.current) {
                clearTimeout(bulkOperationTimeoutRef.current);
                bulkOperationTimeoutRef.current = null;
              }
              setBulkOperationQueue([]);
            }}
          />
        );
      })()}

      {/* Permanent Delete Progress Panel */}
      {permanentDeleteQueue.length > 0 && (() => {
        const allComplete = permanentDeleteQueue.every(item => item.status === 'complete' || item.status === 'error');
        const completedCount = permanentDeleteQueue.filter(item => item.status === 'complete').length;

        return (
          <ProgressPanel
            styles={styles}
            queue={permanentDeleteQueue}
            heading={
              allComplete
                ? `${completedCount} file${completedCount !== 1 ? 's' : ''} permanently deleted`
                : `Permanently deleting ${permanentDeleteQueue.length} file${permanentDeleteQueue.length > 1 ? 's' : ''}`
            }
            onClose={() => {
              if (permanentDeleteTimeoutRef.current) {
                clearTimeout(permanentDeleteTimeoutRef.current);
                permanentDeleteTimeoutRef.current = null;
              }
              setPermanentDeleteQueue([]);
            }}
          />
        );
      })()}
    </>
  );
};

export default ProgressPanels;
