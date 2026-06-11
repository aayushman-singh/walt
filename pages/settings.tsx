/**
 * User Settings Page
 * Preferences, notifications, account settings
 */

import React, { useState, useEffect } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { useUserFileStorage } from '../hooks/useUserFileStorage';
import TwoFactorSetup from '../components/TwoFactorSetup';
import GatewaySettings from '../components/GatewaySettings';
import Toast from '../components/Toast';
import WIcon from '../components/WIcon';
import styles from '../styles/Settings.module.css';

const Settings: NextPage = () => {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { autoPinEnabled, setAutoPinEnabled, pinningWarning } = useUserFileStorage(user?.uid || null);
  
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortEnabled, setSortEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [showGatewaySettings, setShowGatewaySettings] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('vault_theme') as 'light' | 'dark' | null;
      if (savedTheme) {
        setTheme(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
      }

      const savedViewMode = localStorage.getItem('vault_view_mode') as 'grid' | 'list' | null;
      if (savedViewMode) {
        setViewMode(savedViewMode);
      }

      const savedSortEnabled = localStorage.getItem('vault_sort_enabled');
      if (savedSortEnabled !== null) {
        setSortEnabled(savedSortEnabled === 'true');
      }

      const savedNotificationsEnabled = localStorage.getItem('vault_notifications_enabled');
      if (savedNotificationsEnabled !== null) {
        setNotificationsEnabled(savedNotificationsEnabled === 'true');
      }

      const savedEmailNotifications = localStorage.getItem('vault_email_notifications');
      if (savedEmailNotifications !== null) {
        setEmailNotifications(savedEmailNotifications === 'true');
      }
    }
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('vault_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    showToast(`Theme changed to ${newTheme}`, 'success');
  };

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('vault_view_mode', mode);
    showToast(`Default view set to ${mode}`, 'success');
  };

  const handleSortEnabledChange = (enabled: boolean) => {
    setSortEnabled(enabled);
    localStorage.setItem('vault_sort_enabled', enabled.toString());
    showToast(`Real-time sorting ${enabled ? 'enabled' : 'disabled'}`, 'success');
  };

  const handleNotificationsChange = (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    localStorage.setItem('vault_notifications_enabled', enabled.toString());
    showToast(`In-app notifications ${enabled ? 'enabled' : 'disabled'}`, 'success');
  };

  const handleEmailNotificationsChange = (enabled: boolean) => {
    setEmailNotifications(enabled);
    localStorage.setItem('vault_email_notifications', enabled.toString());
    showToast(`Email notifications ${enabled ? 'enabled' : 'disabled'}`, 'success');
  };

  const handleAutoPinChange = (enabled: boolean) => {
    setAutoPinEnabled(enabled);
    showToast(`Auto-pin ${enabled ? 'enabled' : 'disabled'}`, 'success');
  };

  if (authLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <button
            className={styles.backBtn}
            onClick={() => router.push('/dashboard')}
            title="Back to Dashboard"
          >
            <WIcon name="arrow" size={16} style={{ transform: 'scaleX(-1)' }} /> Back
          </button>
          <h1 className={styles.title}>Settings</h1>
        </div>
      </header>

      <div className={styles.content}>
        {/* Appearance Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Appearance</h2>
          
          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>Theme</label>
              <p className={styles.settingDescription}>Choose light or dark theme</p>
            </div>
            <div className={styles.settingControl}>
              <button
                className={`${styles.themeOption} ${theme === 'light' ? styles.active : ''}`}
                onClick={() => handleThemeChange('light')}
              >
                <WIcon name="sun" size={15} /> Light
              </button>
              <button
                className={`${styles.themeOption} ${theme === 'dark' ? styles.active : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                <WIcon name="moon" size={15} /> Dark
              </button>
            </div>
          </div>

          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>Default View</label>
              <p className={styles.settingDescription}>Default view mode for file display</p>
            </div>
            <div className={styles.settingControl}>
              <button
                className={`${styles.viewOption} ${viewMode === 'grid' ? styles.active : ''}`}
                onClick={() => handleViewModeChange('grid')}
              >
                <WIcon name="grid" size={15} /> Grid
              </button>
              <button
                className={`${styles.viewOption} ${viewMode === 'list' ? styles.active : ''}`}
                onClick={() => handleViewModeChange('list')}
              >
                <WIcon name="list" size={15} /> List
              </button>
            </div>
          </div>

          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>Real-time Sorting</label>
              <p className={styles.settingDescription}>Enable automatic sorting when files change</p>
            </div>
            <div className={styles.settingControl}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={sortEnabled}
                  onChange={(e) => handleSortEnabledChange(e.target.checked)}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>
        </section>

        {/* Upload Settings Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Upload Settings</h2>
          
          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>Auto-pin Files</label>
              <p className={styles.settingDescription}>Automatically pin files when uploading</p>
            </div>
            <div className={styles.settingControl}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={autoPinEnabled}
                  onChange={(e) => handleAutoPinChange(e.target.checked)}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>
          {pinningWarning && (
            <p className={styles.pinningWarningNote}>{pinningWarning}</p>
          )}
        </section>

        {/* Notifications Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Notifications</h2>
          
          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>In-app Notifications</label>
              <p className={styles.settingDescription}>Show notifications in the app</p>
            </div>
            <div className={styles.settingControl}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(e) => handleNotificationsChange(e.target.checked)}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>

          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>Email Notifications</label>
              <p className={styles.settingDescription}>Receive notifications via email (coming soon)</p>
            </div>
            <div className={styles.settingControl}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => handleEmailNotificationsChange(e.target.checked)}
                  disabled
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Security</h2>
          
          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>Two-Factor Authentication</label>
              <p className={styles.settingDescription}>Add an extra layer of security to your account (coming soon)</p>
            </div>
            <div className={styles.settingControl}>
              <button
                className={`${styles.actionBtn} ${styles.disabled}`}
                disabled
              >
                <WIcon name="lock" size={15} /> Manage 2FA
              </button>
            </div>
          </div>
        </section>

        {/* Performance Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Performance</h2>
          
          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>Gateway/CDN Settings</label>
              <p className={styles.settingDescription}>Optimize IPFS gateway selection for faster delivery</p>
            </div>
            <div className={styles.settingControl}>
              <button
                className={styles.actionBtn}
                onClick={() => setShowGatewaySettings(true)}
              >
                <WIcon name="bolt" size={15} /> Manage Gateways
              </button>
            </div>
          </div>
        </section>

        {/* Account Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Account</h2>
          
          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>Email</label>
              <p className={styles.settingDescription}>{user.email}</p>
            </div>
          </div>

          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>User ID</label>
              <p className={styles.settingDescription}>{user.uid}</p>
            </div>
          </div>

          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>Sign Out</label>
              <p className={styles.settingDescription}>Sign out of your account</p>
            </div>
            <div className={styles.settingControl}>
              <button
                className={styles.dangerBtn}
                onClick={async () => {
                  await logout();
                  router.push('/');
                }}
              >
                <WIcon name="logout" size={15} /> Sign Out
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Modals */}
      <TwoFactorSetup
        isOpen={showTwoFactorSetup}
        onClose={() => setShowTwoFactorSetup(false)}
        onEnabled={() => {
          showToast('Two-factor authentication enabled!', 'success');
          setShowTwoFactorSetup(false);
        }}
      />

      <GatewaySettings
        isOpen={showGatewaySettings}
        onClose={() => setShowGatewaySettings(false)}
      />

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Settings;

