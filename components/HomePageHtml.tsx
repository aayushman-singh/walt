import React, { useEffect, useRef, useState } from 'react';
import styles from './Home.module.css';
import FileUpload from './FileUpload';
import AuthModal from './AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { scrollToSection } from './SmoothScroll';
import Link from 'next/link';
import HeroMesh from './HeroMesh';
import HeroShield from './HeroShield';
import Testimonials from './Testimonials';
import DecentralizationVisual from './landing/DecentralizationVisual';
import Image from 'next/image';
import { Cover } from './ui/cover';
import BriefcaseIcon from '@rsuite/icons/legacy/Briefcase';
import GithubIcon from '@rsuite/icons/legacy/Github';
import LinkedinIcon from '@rsuite/icons/legacy/Linkedin';
import TwitterIcon from '@rsuite/icons/legacy/Twitter';

type WorkCard = {
  title: string;
  description: string;
  size: 'large' | 'medium' | 'small';
  icon?: string;
  image?: string;
  imagePosition?: 'left' | 'right';
  imageVariant?: 'default' | 'featured' | 'compact' | 'hero' | 'square';
  coverText?: string;
  hideTitle?: boolean;
  coverPlacement?: 'media' | 'heading';
};

type WorkRow =
  | { type: 'single'; card: WorkCard }
  | { type: 'dual'; cards: [WorkCard, WorkCard] };

const hexToRgb = (hex: string) => {
  const normalizedHex = hex.replace('#', '');
  const bigint = parseInt(normalizedHex, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
};

const interpolateColor = (from: string, to: string, progress: number) => {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const fromRgb = hexToRgb(from);
  const toRgb = hexToRgb(to);
  const r = Math.round(fromRgb.r + (toRgb.r - fromRgb.r) * clamped);
  const g = Math.round(fromRgb.g + (toRgb.g - fromRgb.g) * clamped);
  const b = Math.round(fromRgb.b + (toRgb.b - fromRgb.b) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
};

const FRONTEND_SHARE_BASE =
  process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://walt.aayushman.dev';

const HomePageHtml: React.FC = () => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user } = useAuth();
  const [menuBgProgress, setMenuBgProgress] = useState(0);
  const [showGuestUpload, setShowGuestUpload] = useState(false);
  const [guestFile, setGuestFile] = useState<File | null>(null);
  const [guestDownloadUrl, setGuestDownloadUrl] = useState<string | null>(null);
  const [guestLink, setGuestLink] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [guestUploadStatus, setGuestUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestIpfsUri, setGuestIpfsUri] = useState<string | null>(null);
  const guestSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const progress = Math.min(window.scrollY / 300, 1);
      setMenuBgProgress(progress);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (user) {
      setShowGuestUpload(false);
      setGuestFile(null);
      setGuestDownloadUrl(null);
      setGuestLink(null);
      setCopyStatus('idle');
      setGuestUploadStatus('idle');
      setGuestError(null);
      setGuestIpfsUri(null);
    }
  }, [user]);

  useEffect(() => {
    if (showGuestUpload && guestSectionRef.current) {
      guestSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showGuestUpload]);

  const uploadCard: WorkCard = {
    title: 'Upload Files',
    description:
      'Drag and drop or select files to upload. Your files are instantly stored on IPFS with end-to-end encryption. No limits, no restrictions.',
    size: 'large',
    image: '/drag-and-drop.png',
  };

  const secureStorageCard: WorkCard = {
    title: 'Secure Storage',
    description:
      'Your data is encrypted and distributed across the decentralized IPFS network using content addressing. Each file gets a unique cryptographic hash (CID) that ensures integrity and authenticity. Keys never leave your browser, implementing zero trust architecture where our servers never see your encryption keys. Files are automatically replicated across multiple nodes in the network, providing built-in redundancy and resilience. Even if some nodes go offline, your data remains accessible through the distributed network. This decentralized approach means no single point of failure and true ownership of your data.',
    size: 'small',
    image: '/decentralized.jpg',
    imagePosition: 'right',
    imageVariant: 'featured',
  };

  const pinCard: WorkCard = {
    title: 'Pin for Permanence',
    description:
      'Choose which files to pin for permanent storage with transparent pay-as-you-go pricing.',
    size: 'small',
    image: '/pin.png',
    imageVariant: 'compact',
  };

  const freeForeverCard: WorkCard = {
    title: 'Free Forever',
    description:
      'Store unlimited files at no cost. Access your data anytime, anywhere through our intuitive interface.',
    size: 'medium',
    image: '/infinite.png',
    imageVariant: 'compact',
  };

  const accessAnywhereCard: WorkCard = {
    title: 'Access Anywhere',
    description:
      'Your files are accessible from any device, anywhere in the world through optimized IPFS gateways. Access your data on desktop, mobile, or tablet with a consistent experience. Share files securely with others using customizable share links that support password protection, expiration dates (1-365 days), and permission levels (viewer or editor). Track who accessed your shared files with detailed activity logs. Public share pages provide a beautiful interface for recipients to view or download files. Instantly revoke access at any time with one click, and all share links become invalid immediately. Cross-region access ensures fast speeds globally through our distributed gateway network.',
    size: 'large',
    image: '/anywhere.png',
    imageVariant: 'square',
  };

  const fastReliableCard: WorkCard = {
    title: 'Fast & Reliable',
    description:
      'Optimized gateway network ensures fast access speeds. Your data is always available when you need it.',
    size: 'medium',
    coverText: 'Fast & Reliable',
    hideTitle: true,
    coverPlacement: 'heading',
  };

  const workRows: WorkRow[] = [
    { type: 'single', card: uploadCard },
    { type: 'single', card: secureStorageCard },
    { type: 'dual', cards: [pinCard, freeForeverCard] as [WorkCard, WorkCard] },
    { type: 'single', card: accessAnywhereCard },
    { type: 'single', card: fastReliableCard },
  ];

  const footerColumns = [
    {
      title: 'Resources',
      links: [
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' },
        { label: 'Status', href: '/status' },
      ],
    },
    {
      title: 'Developers',
      links: [
        { label: 'Documentation', href: '/docs' },
        { label: 'API Reference', href: '/api-reference' },
        { label: 'Changelog', href: '/changelog' },
      ],
    },
    {
      title: 'Contact Us',
      links: [
        { label: '+91 96505 93099', href: 'tel:+919650593099' },
        { label: 'aayushman2702@gmail.com', href: 'mailto:aayushman2702@gmail.com' },
      ],
    },
  ];

  const footerSocialLinks = [
    { href: 'https://x.com/aayushman2703', Icon: TwitterIcon, label: 'X (Twitter)' },
    { href: 'https://www.linkedin.com/in/aayushman-singh-zz/', Icon: LinkedinIcon, label: 'LinkedIn' },
    { href: 'https://github.com/aayushman-singh', Icon: GithubIcon, label: 'GitHub' },
  ];

  const classNames = (...classes: (string | undefined | false)[]) =>
    classes.filter(Boolean).join(' ');

  const getMedia = (card: WorkCard, extraClassName?: string) => {
    const hasImage = Boolean(card.image);
    const hasCover = Boolean(card.coverText);
    const coverPlacement = card.coverPlacement ?? 'media';

    if (hasImage) {
      const variantClass =
        card.imageVariant === 'featured'
          ? styles['work-media-featured']
          : card.imageVariant === 'compact'
          ? styles['work-media-compact']
          : card.imageVariant === 'hero'
          ? styles['work-media-hero']
          : card.imageVariant === 'square'
          ? styles['work-media-square']
          : '';

      const mediaDimensions =
        card.imageVariant === 'featured'
          ? { width: 420, height: 320, sizes: '(max-width: 768px) 100vw, 420px' }
          : card.imageVariant === 'compact'
          ? { width: 64, height: 64, sizes: '(max-width: 768px) 100vw, 64px' }
          : card.imageVariant === 'hero'
          ? { width: 520, height: 360, sizes: '(max-width: 768px) 100vw, 520px' }
          : card.imageVariant === 'square'
          ? { width: 360, height: 360, sizes: '(max-width: 768px) 100vw, 360px' }
          : { width: 320, height: 240, sizes: '(max-width: 768px) 100vw, 320px' };

      const imageStyle =
        card.imageVariant === 'compact'
          ? { width: '64px', height: '64px', objectFit: 'contain' as const }
          : card.imageVariant === 'square'
          ? { width: '100%', height: '100%', objectFit: 'cover' as const }
          : { width: '100%', height: 'auto', objectFit: 'contain' as const };

      return (
        <div className={classNames(styles['work-media'], variantClass, extraClassName)}>
          <Image
            src={card.image as string}
            alt={`${card.title} illustration`}
            width={mediaDimensions.width}
            height={mediaDimensions.height}
            sizes={mediaDimensions.sizes}
            className={styles['work-media-image']}
            style={imageStyle}
          />
        </div>
      );
    }

    if (hasCover && coverPlacement === 'media') {
      return (
        <div
          className={classNames(styles['work-media'], styles['work-media-cover'], extraClassName)}
        >
          <Cover>{card.coverText}</Cover>
        </div>
      );
    }

    return null;
  };

  const renderSingleRow = (card: WorkCard, index: number) => {
    const coverPlacement = card.coverPlacement ?? 'media';
    const hasMedia = Boolean(card.image) || (Boolean(card.coverText) && coverPlacement === 'media');
    const media = hasMedia ? getMedia(card) : null;
    const showCoverHeading = Boolean(card.coverText) && coverPlacement === 'heading';
    const isCentered = showCoverHeading;

    return (
      <div
        key={`${card.title}-${index}`}
        className={`${styles['work-row']} ${hasMedia ? styles['work-row-media'] : styles['work-row-icon']} ${
          isCentered ? styles['work-row-centered'] : ''
        }`}
      >
        {hasMedia && card.imagePosition !== 'right' && media}
        <div
          className={`${styles['work-card']} ${styles[`work-card-${card.size}`]} ${
            hasMedia ? styles['work-card-with-media'] : ''
          } ${hasMedia && card.imagePosition === 'right' ? styles['work-card-media-right'] : ''} ${
            isCentered ? styles['work-card-centered'] : ''
          }`}
        >
          <div className={styles['work-card-body']}>
            {!hasMedia && card.icon && (
              <div className={styles['work-icon']} aria-hidden="true">
                {card.icon}
              </div>
            )}
            <div
              className={classNames(
                styles['work-card-content'],
                isCentered && styles['work-card-content-centered']
              )}
            >
              {!card.hideTitle && <h3>{card.title}</h3>}
              {showCoverHeading && (
                <div
                  className={classNames(
                    styles['work-cover-inline'],
                    styles['work-cover-inline-centered']
                  )}
                >
                  <Cover>{card.coverText}</Cover>
                </div>
              )}
              <p>{card.description}</p>
            </div>
          </div>
        </div>
        {hasMedia && card.imagePosition === 'right' && media}
      </div>
    );
  };

  const renderDualRow = (cards: [WorkCard, WorkCard], index: number) => (
    <div key={`dual-row-${index}`} className={`${styles['work-row']} ${styles['work-row-dual']}`}>
      {cards.map((card) => (
        <div key={card.title} className={styles['work-column-card']}>
          {card.image && getMedia(card, styles['work-column-media'])}
          <div className={styles['work-column-content']}>
            {!card.hideTitle && <h3>{card.title}</h3>}
            <p>{card.description}</p>
          </div>
        </div>
      ))}
    </div>
  );

  const handleGuestFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setGuestFile(file);
    setGuestUploadStatus('uploading');
    setGuestError(null);
    setGuestLink(null);
    setGuestDownloadUrl(null);
    setGuestIpfsUri(null);
    setCopyStatus('idle');

    try {
      const uploadResult = await uploadGuestFileToIpfs(file);
      setGuestIpfsUri(uploadResult.ipfsUri);
      setGuestDownloadUrl(uploadResult.gatewayUrl);
      setGuestLink(uploadResult.gatewayUrl);
      setGuestUploadStatus('done');
    } catch (error) {
      console.error('Guest upload failed:', error);
      setGuestUploadStatus('error');
      setGuestError('Upload failed. Please try again.');
    }
  };

  const handleCopyLink = async () => {
    if (!guestLink) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(guestLink);
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('Failed to copy link', error);
    }
  };

  const resetGuestUpload = () => {
    setGuestFile(null);
    setGuestDownloadUrl(null);
    setGuestLink(null);
    setCopyStatus('idle');
    setGuestUploadStatus('idle');
    setGuestError(null);
    setGuestIpfsUri(null);
  };

  const uploadGuestFileToIpfs = async (
    file: File
  ): Promise<{ ipfsUri: string; gatewayUrl: string; cid: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/guest/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json().catch(() => ({
      error: 'Upload failed',
    }));

    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    return data;
  };

  return (
    <div className={styles["bg"]}>
      <header>
        <div
          className={styles["menu-bar"]}
          style={{
            backgroundColor: interpolateColor('#000000', '#00171f', menuBgProgress),
            boxShadow: `0 18px 36px rgba(0, 0, 0, ${0.25 + menuBgProgress * 0.2})`,
            borderBottom: `1px solid rgba(173, 235, 255, ${0.05 + menuBgProgress * 0.15})`,
          }}
        >
          <div className={styles.logo}>Walt</div>
          <nav className={styles["menu-items"]}>
            <a
              href="#welcome-hero"
              onClick={scrollToSection}
              className={`${styles["menu-item"]} ${styles.menuLamp}`}
            >
              Home
            </a>
            <a
              href="#about"
              onClick={scrollToSection}
              className={`${styles["menu-item"]} ${styles.menuLamp}`}
            >
              About
            </a>
            <a
              href="#working"
              onClick={scrollToSection}
              className={`${styles["menu-item"]} ${styles.menuLamp}`}
            >
              How it works
            </a>
          </nav>
          <div className={styles["menu-right"]}>
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className={`${styles["menu-item"]} ${styles.menuLamp}`}
                >
                  Dashboard
                </Link>
              </>
            ) : (
              <button
                className={styles["authBtn"]}
                onClick={() => setShowAuthModal(true)}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={styles["main"]}>
        <section id="welcome-hero" className={styles["welcome-hero"]}>
          <HeroMesh />
          <HeroShield />
          <div className={styles["container"]}>
            <div className="row">
              <div className="col-md-12 text-center">
                <div className={styles["header-text"]}>
                  <h2>
                    Easy and Reliable Asset Storage
                  </h2>
                  <p className={styles.heroAccent}>
                    Experience true data security with IPFS on chain storage
                  </p>
                </div>
                <div className={styles["main-link"]}>
                  {user ? (
                    <FileUpload />
                  ) : (
                    <>
                      <button
                        className={`${styles["mainBtn"]} ${
                          showGuestUpload ? styles["mainBtnDisabled"] : ''
                        }`}
                        onClick={() => setShowGuestUpload(true)}
                        disabled={showGuestUpload}
                      >
                        <p>{showGuestUpload ? 'Upload ready' : 'Upload a file'}</p>
                      </button>
                      <button
                        className={`${styles["mainBtn"]} ${styles["mainBtnSecondary"]}`}
                        onClick={() => setShowAuthModal(true)}
                      >
                        <p>Sign In</p>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {!user && showGuestUpload && (
          <section
            id="guest-upload"
            className={styles["guestUploadSection"]}
            ref={guestSectionRef}
          >
            <div className={styles["guestUploadContainer"]}>
              <div className={styles["guestUploadHeader"]}>
                <div>
                  <h3>Quick guest upload</h3>
                  <p>
                    Store a file temporarily and share it instantly. This preview upload expires
                    after 24 hours or when you close the page.
                  </p>
                </div>
                <button className={styles["guestResetBtn"]} onClick={resetGuestUpload}>
                  Start over
                </button>
              </div>
              <div className={styles["guestUploadBody"]}>
                <label className={styles["guestUploadDropzone"]}>
                  <input
                    type="file"
                    onChange={handleGuestFileChange}
                    className={styles["guestUploadInput"]}
                  />
                  {guestFile ? (
                    <div>
                      <p className={styles["guestFileName"]}>{guestFile.name}</p>
                      <p className={styles["guestFileMeta"]}>
                        {(guestFile.size / 1024 / 1024).toFixed(2)} MB ·{' '}
                        {guestFile.type || 'Unknown type'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className={styles["guestUploadPrompt"]}>Click to pick a file</p>
                      <p className={styles["guestUploadHint"]}>
                        We simulate the upload and generate a share link instantly
                      </p>
                    </div>
                  )}
                </label>
                {guestFile && (
                  <div className={styles["guestUploadResult"]}>
                    <p className={styles["guestStatus"]}>
                      {guestUploadStatus === 'uploading' && 'Uploading to IPFS…'}
                      {guestUploadStatus === 'done' && 'Upload complete — share or download below.'}
                      {guestUploadStatus === 'error' && guestError}
                    </p>
                    {guestIpfsUri && (
                      <p className={styles["guestIpfsUri"]}>
                        CID: <span>{guestIpfsUri.replace('ipfs://', '')}</span>
                      </p>
                    )}
                    <div className={styles["guestLinkRow"]}>
                      <input
                        type="text"
                        readOnly
                        value={guestLink ?? ''}
                        className={styles["guestLinkInput"]}
                      />
                      <button
                        className={styles["guestCopyBtn"]}
                        onClick={handleCopyLink}
                        disabled={!guestLink}
                      >
                        {copyStatus === 'copied' ? 'Copied' : 'Copy link'}
                      </button>
                    </div>
                    <div className={styles["guestActions"]}>
                      <button
                        className={styles["guestActionBtn"]}
                        onClick={() => guestDownloadUrl && window.open(guestDownloadUrl, '_blank')}
                        disabled={!guestDownloadUrl}
                      >
                        Download file
                      </button>
                      <button className={styles["guestActionBtn"]} onClick={resetGuestUpload}>
                        Remove file
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}


        <section id="about" className={styles["vault"]}>
          <div className={styles["about-container"]}>
            <div className={styles["about-heading"]}>
              <h2>About Walt</h2>
            </div>
            <div className={styles["about-content"]}>
              <p className={styles["about-text"]}>
                Walt is completely free forever. Upload and store your files with
                zero cost. When you want permanent storage, pay as you go per file
                with transparent pricing. Experience the power of Web 3.0 with an
                intuitive interface that keeps things simple while maintaining
                top-notch security measures.
              </p>
              <button className={styles["discoverBtn"]}>
                Discover Features
              </button>
            </div>
          </div>
        </section>

        <section id="working" className={styles["working"]}>
          <div className={styles["working-header"]}>
            <h2>How it works</h2>
          </div>

          <div className={styles["working-grid"]}>
            {workRows.map((row, index) =>
              row.type === 'dual'
                ? renderDualRow(row.cards, index)
                : renderSingleRow(row.card, index)
            )}
          </div>
        </section>

        <DecentralizationVisual />

        <section id="creator" className={styles["creator-section"]}>
          <div className={styles["creator-container"]}>
            <div className={styles["creator-image"]}>
              <div className={styles["creator-avatar"]}>
                <Image
                  src="/slack_dp.png"
                  alt="Aayushman Singh"
                  width={200}
                  height={200}
                  className={styles["creator-photo"]}
                />
              </div>
            </div>
            <div className={styles["creator-content"]}>
              <h2>Built by Aayushman Singh</h2>
              <p className={styles["creator-bio"]}>
                Passionate developer building decentralized solutions for the future.
                Check out my work on GitHub and connect with me.
              </p>
              <div className={styles["creator-links"]}>
                <a
                  href="https://github.com/aayushman-singh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles["creator-link"]}
                >
                  <GithubIcon />
                  GitHub
                </a>
                <a
                  href="https://aayushman.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles["creator-link"]}
                >
                  <BriefcaseIcon />
                  Portfolio
                </a>
              </div>
            </div>
          </div>
        </section>

        <Testimonials />
      </main>
      <footer className={styles["footer"]}>
        <div className={styles["footer-glow"]} aria-hidden="true" />
        <div className={styles["footer-content"]}>
          <div className={styles["footer-brand-block"]}>
            <p className={styles["footer-title"]}>Walt</p>
            <p className={styles["footer-tagline"]}>
              Built with care by Aayushman Singh.
            </p>
            <div className={styles["footer-icons"]}>
              {footerSocialLinks.map(({ href, Icon, label }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles["footer-icon"]}
                  aria-label={label}
                >
                  <Icon />
                </a>
              ))}
            </div>
            <a
              href="https://buymeacoffee.com/aayushmansingh"
              target="_blank"
              rel="noopener noreferrer"
              className={styles["buyCoffeeBtn"]}
            >
              Buy me a coffee
            </a>
          </div>

          <div className={styles["footer-columns"]}>
            {footerColumns.map((column) => (
              <div key={column.title} className={styles["footer-column"]}>
                <p className={styles["footer-column-title"]}>{column.title}</p>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className={styles["footer-column-link"]}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className={styles["footer-bottom"]}>
          <p className={styles["footer-copy"]}>&copy; 2025 @ Aayushman Singh</p>
        </div>
      </footer>

      {/* Auth Modal */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default HomePageHtml;
