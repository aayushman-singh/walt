/**
 * Search bar with the filter dropdown panel and the recent/saved/suggestions
 * dropdown. Extracted verbatim from the dashboard header.
 */

import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { WIcon } from '../WIcon';
import { DashboardFilters, SavedSearch } from './types';

interface SearchBarProps {
  styles: { [key: string]: string };
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
}

const SearchBar: React.FC<SearchBarProps> = ({
  styles,
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
}) => {
  return (
    <div className={styles.searchContainer}>
      <div className={styles.searchBar}>
        <span className={styles.searchIcon}><WIcon name="search" size={16} /></span>
        <input
          type="text"
          placeholder="Search in Drive"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (e.target.value.trim() && e.target.value !== searchTerm) {
              saveSearch(e.target.value.trim());
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchTerm.trim()) {
              saveSearch(searchTerm.trim());
              setShowSuggestions(false);
            }
          }}
          onFocus={() => {
            if (searchTerm.length > 0 || recentSearches.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onBlur={() => {
            // Delay to allow click on suggestions
            setTimeout(() => setShowSuggestions(false), 200);
          }}
          className={styles.searchInput}
        />
        <DropdownMenu open={showFilters} onOpenChange={setShowFilters}>
          <DropdownMenuTrigger asChild>
            <button
              className={styles.filterToggle}
              title="Show filters"
            >
              <WIcon name="sliders" size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className={styles.filterPanel}
            sideOffset={8}
          >
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Type</label>
              <select
                value={filters.fileType}
                onChange={(e) => setFilters({...filters, fileType: e.target.value as any})}
                className={styles.filterSelect}
              >
                <option value="all">All Types</option>
                <option value="folder">Folders</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="audio">Audio</option>
                <option value="document">Documents</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Pin Status</label>
              <select
                value={filters.pinStatus}
                onChange={(e) => setFilters({...filters, pinStatus: e.target.value as any})}
                className={styles.filterSelect}
              >
                <option value="all">All Files</option>
                <option value="pinned">Pinned</option>
                <option value="unpinned">Unpinned</option>
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Star Status</label>
              <select
                value={filters.starStatus}
                onChange={(e) => setFilters({...filters, starStatus: e.target.value as any})}
                className={styles.filterSelect}
              >
                <option value="all">All</option>
                <option value="starred">Starred</option>
                <option value="unstarred">Unstarred</option>
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Tags</label>
              <div className={styles.tagFilter}>
                {getAllTags().length > 0 ? (
                  <select
                    multiple
                    value={filters.tags}
                    onChange={(e) => {
                      const selectedTags = Array.from(e.target.selectedOptions, option => option.value);
                      setFilters({...filters, tags: selectedTags});
                    }}
                    className={styles.tagSelect}
                    size={Math.min(5, getAllTags().length + 1)}
                  >
                    {getAllTags().map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                ) : (
                  <span className={styles.noTagsHint}>No tags yet - add tags to files to filter by them</span>
                )}
                {filters.tags.length > 0 && (
                  <button
                    className={styles.clearTagFilterBtn}
                    onClick={() => setFilters({...filters, tags: []})}
                    title="Clear tag filter"
                  >
                    Clear Tags
                  </button>
                )}
              </div>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Size (MB)</label>
              <div className={styles.filterRange}>
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.sizeMin}
                  onChange={(e) => setFilters({...filters, sizeMin: e.target.value})}
                  className={styles.filterInput}
                />
                <span>to</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.sizeMax}
                  onChange={(e) => setFilters({...filters, sizeMax: e.target.value})}
                  className={styles.filterInput}
                />
              </div>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Date Range</label>
              <div className={styles.filterRange}>
                <input
                  type="date"
                  placeholder="From"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                  className={styles.filterInput}
                />
                <span>to</span>
                <input
                  type="date"
                  placeholder="To"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                  className={styles.filterInput}
                />
              </div>
            </div>

            <div className={styles.filterButtons}>
              <button
                className={styles.clearFilters}
                onClick={() => setFilters({
                  fileType: 'all',
                  pinStatus: 'all',
                  starStatus: 'all',
                  tags: [],
                  sizeMin: '',
                  sizeMax: '',
                  dateFrom: '',
                  dateTo: ''
                })}
              >
                Clear All Filters
              </button>
              <button
                className={styles.saveSearchBtnFilter}
                onClick={() => {
                  saveCurrentSearch();
                  setShowFilters(false);
                }}
                title="Save current search with filters"
              >
                <WIcon name="download" size={15} /> Save Search
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Search Suggestions Dropdown */}
      <DropdownMenu open={showSuggestions && (searchSuggestions.length > 0 || (searchTerm.length === 0 && (recentSearches.length > 0 || savedSearches.length > 0)))} onOpenChange={setShowSuggestions}>
        <DropdownMenuTrigger asChild>
          <div style={{ display: 'none' }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className={styles.searchSuggestions}
          sideOffset={4}
        >
          {searchTerm.length === 0 && savedSearches.length > 0 && (
            <>
              <div className={styles.suggestionHeader}>
                <span>Saved Searches</span>
                <button
                  className={styles.saveSearchBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    saveCurrentSearch();
                  }}
                  title="Save current search"
                >
                  <WIcon name="download" size={13} /> Save
                </button>
              </div>
              {savedSearches.map((savedSearch, idx) => (
                <DropdownMenuItem
                  key={`saved-${idx}`}
                  className={styles.suggestionItem}
                  onClick={() => {
                    loadSavedSearch(savedSearch);
                    setShowSuggestions(false);
                  }}
                >
                  <span className={styles.suggestionIcon}><WIcon name="starFill" size={16} /></span>
                  <span className={styles.suggestionText}>{savedSearch.name}</span>
                  <button
                    className={styles.deleteSavedSearchBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSavedSearch(savedSearch.name);
                    }}
                    title="Delete saved search"
                  >
                    <WIcon name="close" size={16} />
                  </button>
                </DropdownMenuItem>
              ))}
            </>
          )}
          {searchTerm.length === 0 && recentSearches.length > 0 && (
            <>
              {savedSearches.length > 0 && <div className={styles.suggestionDivider}></div>}
              <div className={styles.suggestionHeader}>Recent Searches</div>
              {recentSearches.map((search, idx) => (
                <DropdownMenuItem
                  key={`recent-${idx}`}
                  className={styles.suggestionItem}
                  onClick={() => {
                    setSearchTerm(search);
                    saveSearch(search);
                    setShowSuggestions(false);
                  }}
                >
                  <span className={styles.suggestionIcon}><WIcon name="clock" size={16} /></span>
                  <span>{search}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          {searchSuggestions.length > 0 && (
            <>
              {searchTerm.length > 0 && recentSearches.length > 0 && <div className={styles.suggestionDivider}></div>}
              <div className={styles.suggestionHeader}>Suggestions</div>
              {searchSuggestions.map((suggestion, idx) => (
                <DropdownMenuItem
                  key={`suggestion-${idx}`}
                  className={styles.suggestionItem}
                  onClick={() => {
                    setSearchTerm(suggestion);
                    saveSearch(suggestion);
                    setShowSuggestions(false);
                  }}
                >
                  <span className={styles.suggestionIcon}><WIcon name="search" size={16} /></span>
                  <span>{suggestion}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default SearchBar;
