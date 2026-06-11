/**
 * File-type icon helper extracted from pages/dashboard.tsx (getFileIcon).
 * Returns the same RSuite icon elements for a given MIME type.
 */

import React from 'react';
import WIcon, { WIconName } from '../WIcon';

export const getFileIcon = (type: string): React.ReactElement => {
  if (type.startsWith('image/')) return <WIcon name="image" size={16} />;
  if (type.startsWith('video/')) return <WIcon name="video" size={16} />;
  if (type.startsWith('audio/')) return <WIcon name="audio" size={16} />;
  if (type.includes('pdf')) return <WIcon name="fileDoc" size={16} />;
  if (type.includes('word') || type.includes('document')) return <WIcon name="fileDoc" size={16} />;
  if (type.includes('sheet') || type.includes('excel')) return <WIcon name="sheet" size={16} />;
  if (type.includes('zip') || type.includes('rar')) return <WIcon name="archive" size={16} />;
  return <WIcon name="fileDoc" size={16} />;
};
