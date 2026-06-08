/**
 * File-type icon helper extracted from pages/dashboard.tsx (getFileIcon).
 * Returns the same RSuite icon elements for a given MIME type.
 */

import React from 'react';
import ImageIcon from '@rsuite/icons/Image';
import VideoIcon from '@rsuite/icons/Video';
import AudioIcon from '@rsuite/icons/Audio';
import PageIcon from '@rsuite/icons/Page';
import TableIcon from '@rsuite/icons/Table';
import ArchiveIcon from '@rsuite/icons/Archive';

export const getFileIcon = (type: string): React.ReactElement => {
  if (type.startsWith('image/')) return <ImageIcon />;
  if (type.startsWith('video/')) return <VideoIcon />;
  if (type.startsWith('audio/')) return <AudioIcon />;
  if (type.includes('pdf')) return <PageIcon />;
  if (type.includes('word') || type.includes('document')) return <PageIcon />;
  if (type.includes('sheet') || type.includes('excel')) return <TableIcon />;
  if (type.includes('zip') || type.includes('rar')) return <ArchiveIcon />;
  return <PageIcon />;
};
