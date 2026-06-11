// Walt · SOVEREIGN shared line-icon set — stroke-based, currentColor, no emoji.
// Usage: <WIcon name="key" size={20} sw={1.6} />
import React from 'react';

export type WIconName =
  | 'key' | 'network' | 'bolt' | 'shield' | 'lock' | 'pin' | 'upload' | 'hash'
  | 'server' | 'globe' | 'check' | 'arrow' | 'copy' | 'layers' | 'eye' | 'github'
  | 'x' | 'linkedin' | 'folder' | 'search' | 'grid' | 'list' | 'download' | 'share'
  | 'star' | 'starFill' | 'pinFilled' | 'dots' | 'plus' | 'gear' | 'sun' | 'moon'
  | 'trash' | 'info' | 'warning' | 'chevronDown' | 'sliders' | 'clock' | 'image'
  | 'video' | 'audio' | 'fileDoc' | 'sheet' | 'archive' | 'close' | 'sortAsc'
  | 'sortDesc' | 'logout' | 'user' | 'folderPlus' | 'edit' | 'tag' | 'history'
  | 'pinAlt' | 'menu' | 'cloud' | 'bell' | 'briefcase';

const P: Record<WIconName, React.ReactNode> = {
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.6 12.4 21 2" /><path d="M16 7l3 3" /><path d="M18.5 4.5l3 3" /></>,
  network: <><circle cx="12" cy="4" r="2.2" /><circle cx="4.5" cy="18" r="2.2" /><circle cx="19.5" cy="18" r="2.2" /><path d="M10.6 5.9 6 16M13.4 5.9 18 16M6.7 18h10.6" /></>,
  bolt: <><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></>,
  shield: <><path d="M12 3l7 3v5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  pin: <><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" /></>,
  upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  hash: <><path d="M10 3 8 21M16 3l-2 18M4 9h17M3 15h17" /></>,
  server: <><rect x="4" y="4" width="16" height="7" rx="1.6" /><rect x="4" y="13" width="16" height="7" rx="1.6" /><path d="M8 7.5h.01M8 16.5h.01" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.7 2.6 4 5.7 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.7-4-9s1.3-6.4 4-9Z" /></>,
  check: <><path d="m4 12 5 5 11-11" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  github: <><path d="M9 19c-4 1.4-4-2.2-5.5-3M15 21v-3.4c0-1 .3-1.7.9-2.3-3-.3-6-1.4-6-6.3 0-1.4.5-2.5 1.3-3.4-.1-.3-.6-1.6.1-3.3 0 0 1.1-.3 3.5 1.3a12 12 0 0 1 6.4 0c2.4-1.6 3.5-1.3 3.5-1.3.7 1.7.2 3 .1 3.3.8.9 1.3 2 1.3 3.4 0 4.9-3 6-6 6.3.6.6.9 1.4.9 2.5V21" /></>,
  x: <><path d="M4 4l16 16M20 4 4 20" /></>,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>,
  download: <><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></>,
  share: <><circle cx="6" cy="12" r="2.6" /><circle cx="17" cy="6" r="2.6" /><circle cx="17" cy="18" r="2.6" /><path d="m8.3 10.8 6.4-3.6M8.3 13.2l6.4 3.6" /></>,
  star: <><path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 17.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3Z" /></>,
  starFill: <><path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 17.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3Z" fill="currentColor" stroke="none" /></>,
  pinFilled: <><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" fill="currentColor" /></>,
  dots: <><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></>,
  trash: <><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  warning: <><path d="M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h7M15 17h5" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="13" cy="17" r="2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="m4 17 5-5 4 4 3-3 4 4" /></>,
  video: <><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></>,
  audio: <><path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
  fileDoc: <><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  sheet: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16M10 4v16" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>,
  close: <><path d="M5 5l14 14M19 5 5 19" /></>,
  sortAsc: <><path d="M7 4v16M7 4l-3 3M7 4l3 3M13 7h7M13 12h5M13 17h3" /></>,
  sortDesc: <><path d="M7 20V4M7 20l-3-3M7 20l3-3M13 7h3M13 12h5M13 17h7" /></>,
  logout: <><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 12H3M10 12l3-3M10 12l3 3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  folderPlus: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M12 11v5M9.5 13.5h5" /></>,
  edit: <><path d="M4 20h4l10-10a2 2 0 0 0-3-3L5 17v3Z" /><path d="M13.5 6.5l3 3" /></>,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" /><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4M12 8v4l3 2" /></>,
  pinAlt: <><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  cloud: <><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 18 17.5" /><path d="M12 13v6M12 13l-2.5 2.5M12 13l2.5 2.5" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 1.8 6 1.8 6H4.2S6 14 6 9Z" /><path d="M10.2 20a2 2 0 0 0 3.6 0" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" /><path d="M3 12h18" /></>,
};

export interface WIconProps {
  name: WIconName;
  size?: number;
  sw?: number;
  style?: React.CSSProperties;
  className?: string;
}

export const WIcon = React.memo(function WIcon({ name, size = 22, sw = 1.6, style, className }: WIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {P[name] || null}
    </svg>
  );
});

export default WIcon;
