/**
 * Top app header: logo, search bar with filter panel + suggestions dropdown,
 * keyboard-shortcuts card, mobile-menu toggle, theme toggle, billing CTA,
 * notifications, and the user dropdown. Extracted verbatim from
 * pages/dashboard.tsx.
 */

import React from 'react';
import { User } from 'firebase/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import NotificationBell from '../NotificationBell';
import CloseIcon from '@rsuite/icons/Close';
import MenuIcon from '@rsuite/icons/Menu';
import StorageIcon from '@rsuite/icons/Storage';
import SettingIcon from '@rsuite/icons/Setting';
import PeoplesIcon from '@rsuite/icons/Peoples';
import ArrowDownIcon from '@rsuite/icons/ArrowDown';
import SearchBar from './SearchBar';
import { DashboardFilters, SavedSearch } from './types';

interface HeaderProps {
  styles: { [key: string]: string };
  user: User;
  router: { push: (url: string) => void };
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  saveSearch: (term: string) => void;
  showSuggestions: boolean;
  setShowSuggestions: (show: boolean) => void;
  searchSuggestions: string[];
  recentSearches: string[];
  savedSearches: SavedSearch[];
  loadSavedSearch: (s: SavedSearch) => void;
  saveCurrentSearch: () => void;
  deleteSavedSearch: (name: string) => void;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
  getAllTags: () => string[];
  showKeyboardShortcuts: boolean;
  setShowKeyboardShortcuts: (show: boolean) => void;
  showMobileMenu: boolean;
  setShowMobileMenu: (show: boolean) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  shouldShowBillingCTA: () => boolean;
  setShowPaymentModal: (show: boolean) => void;
  handleExportAll: () => void;
  handleLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({
  styles,
  user,
  router,
  searchTerm,
  setSearchTerm,
  saveSearch,
  showSuggestions,
  setShowSuggestions,
  searchSuggestions,
  recentSearches,
  savedSearches,
  loadSavedSearch,
  saveCurrentSearch,
  deleteSavedSearch,
  showFilters,
  setShowFilters,
  filters,
  setFilters,
  getAllTags,
  showKeyboardShortcuts,
  setShowKeyboardShortcuts,
  showMobileMenu,
  setShowMobileMenu,
  theme,
  setTheme,
  shouldShowBillingCTA,
  setShowPaymentModal,
  handleExportAll,
  handleLogout,
}) => {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button className={styles.logoBtn} onClick={() => router.push('/')}>
          <span className={styles.logoText}>Walt</span>
        </button>
        <SearchBar
          styles={styles}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          saveSearch={saveSearch}
          showSuggestions={showSuggestions}
          setShowSuggestions={setShowSuggestions}
          searchSuggestions={searchSuggestions}
          recentSearches={recentSearches}
          savedSearches={savedSearches}
          loadSavedSearch={loadSavedSearch}
          saveCurrentSearch={saveCurrentSearch}
          deleteSavedSearch={deleteSavedSearch}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          filters={filters}
          setFilters={setFilters}
          getAllTags={getAllTags}
        />
      </div>
      <div className={styles.headerRight}>
        {/* Keyboard Shortcuts Card - Hidden on mobile */}
        <DropdownMenu open={showKeyboardShortcuts} onOpenChange={setShowKeyboardShortcuts}>
          <DropdownMenuTrigger asChild>
            <div className={styles.keyboardShortcutsCard}>
              <span className={styles.keyboardShortcutsLabel}>Keyboard Shortcuts</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={styles.keyboardShortcutsTooltip}
            sideOffset={8}
          >
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutKey}>Ctrl+K</span> or <span className={styles.shortcutKey}>/</span>
                <span className={styles.shortcutAction}>Focus search</span>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutKey}>Esc</span>
                <span className={styles.shortcutAction}>Clear search / Close menus</span>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutKey}>Ctrl+N</span>
                <span className={styles.shortcutAction}>New folder</span>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutKey}>Ctrl+,</span>
                <span className={styles.shortcutAction}>Toggle theme</span>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutKey}>1</span>
                <span className={styles.shortcutAction}>My Drive</span>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutKey}>2</span>
                <span className={styles.shortcutAction}>Recent</span>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutKey}>3</span>
                <span className={styles.shortcutAction}>Starred</span>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutKey}>4</span>
                <span className={styles.shortcutAction}>Trash</span>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutKey}>g + v</span>
                <span className={styles.shortcutAction}>Grid view</span>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutKey}>g + l</span>
                <span className={styles.shortcutAction}>List view</span>
              </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Mobile Menu Button */}
        <button
          className={styles.mobileMenuBtn}
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          title="Menu"
          aria-label="Toggle menu"
        >
          {showMobileMenu ? <CloseIcon /> : <MenuIcon />}
        </button>

        <button
          className={styles.themeToggle}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          {theme === 'light' ? <span>🌙</span> : <span>☀️</span>}
        </button>

        {shouldShowBillingCTA() && (
          <button
            className={styles.billingDueButton}
            onClick={() => setShowPaymentModal(true)}
            title="Billing day: add payment info now"
          >
            💳 Pay now
          </button>
        )}

        {/* Notifications */}
        <NotificationBell />

        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className={styles.userDropdownTrigger}>
            <span className={styles.userEmail}>{user.email}</span>
            <span className={styles.userIcon}><PeoplesIcon /></span>
            <span className={styles.dropdownArrow}><ArrowDownIcon /></span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={styles.userDropdownContent}>
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <span className={styles.dropdownIcon}><SettingIcon /></span>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem className={styles.menuDisabled} onClick={(e) => { e.stopPropagation(); }}>
              <span className={styles.dropdownIcon}>🔒</span>
              2FA (Coming Soon)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportAll}>
              <span className={styles.dropdownIcon}><StorageIcon /></span>
              Export All
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <span className={styles.dropdownIcon}>🚪</span>
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
