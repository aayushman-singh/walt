/**
 * Search state for the dashboard: live suggestions, recent searches, and saved
 * searches (both persisted to localStorage per-user). Extracted verbatim from
 * pages/dashboard.tsx — same effects, same localStorage keys, same toasts.
 */

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { DashboardFilters, SavedSearch, InputModalState, UploadedFile } from '../types';

type ShowToast = (
  message: string,
  type?: 'success' | 'error' | 'info',
  title?: string,
  progress?: number,
) => void;

interface UseSearchParams {
  user: User | null;
  uploadedFiles: UploadedFile[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
  showToast: ShowToast;
  setInputModal: React.Dispatch<React.SetStateAction<InputModalState>>;
}

export function useSearch({
  user,
  uploadedFiles,
  searchTerm,
  setSearchTerm,
  filters,
  setFilters,
  showToast,
  setInputModal,
}: UseSearchParams) {
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSavedSearchesMenu, setShowSavedSearchesMenu] = useState(false);

  // Load recent searches and saved searches from localStorage
  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`recent_searches_${user.uid}`);
      if (saved) {
        try {
          setRecentSearches(JSON.parse(saved));
        } catch (e) {
          // Ignore parse errors
        }
      }
      const savedSearchesData = localStorage.getItem(`saved_searches_${user.uid}`);
      if (savedSearchesData) {
        try {
          setSavedSearches(JSON.parse(savedSearchesData));
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }, [user]);

  // Generate search suggestions based on file names
  useEffect(() => {
    if (searchTerm.length > 0) {
      const suggestions = uploadedFiles
        .filter(file =>
          !file.trashed &&
          file.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .map(file => file.name)
        .slice(0, 5);
      setSearchSuggestions(suggestions);
      setShowSuggestions(true);
    } else {
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
  }, [searchTerm, uploadedFiles]);

  // Save search to recent searches
  const saveSearch = (term: string) => {
    if (!user || !term.trim()) return;

    const updated = [term, ...recentSearches.filter(s => s !== term)].slice(0, 10);
    setRecentSearches(updated);
    localStorage.setItem(`recent_searches_${user.uid}`, JSON.stringify(updated));
  };

  // Save current search as a saved search
  const saveCurrentSearch = () => {
    if (!user) return;

    const hasActiveSearch = searchTerm.trim() || Object.values(filters).some(v => v !== 'all' && v !== '');
    if (!hasActiveSearch) {
      showToast('No search query or filters to save', 'info');
      return;
    }

    setInputModal({
      isOpen: true,
      title: 'Save Search',
      message: 'Enter a name for this search:',
      placeholder: 'Search name (e.g., "Large PDFs", "Pinned Images")',
      defaultValue: '',
      onConfirm: (name) => {
        if (!name.trim()) {
          setInputModal(prev => ({ ...prev, isOpen: false }));
          return;
        }
        const newSavedSearch = {
          name: name.trim(),
          query: searchTerm,
          filters: { ...filters }
        };
        const updated = [...savedSearches.filter(s => s.name !== name.trim()), newSavedSearch];
        setSavedSearches(updated);
        localStorage.setItem(`saved_searches_${user.uid}`, JSON.stringify(updated));
        setInputModal(prev => ({ ...prev, isOpen: false }));
        showToast('Search saved successfully', 'success');
      }
    });
  };

  // Load a saved search
  const loadSavedSearch = (savedSearch: SavedSearch) => {
    setSearchTerm(savedSearch.query);
    setFilters(savedSearch.filters);
    setShowSuggestions(false);
    showToast(`Loaded search: ${savedSearch.name}`, 'success');
  };

  // Delete a saved search
  const deleteSavedSearch = (name: string) => {
    if (!user) return;
    const updated = savedSearches.filter(s => s.name !== name);
    setSavedSearches(updated);
    localStorage.setItem(`saved_searches_${user.uid}`, JSON.stringify(updated));
    showToast('Search deleted', 'success');
  };

  return {
    searchSuggestions,
    showSuggestions,
    setShowSuggestions,
    recentSearches,
    savedSearches,
    showSavedSearchesMenu,
    setShowSavedSearchesMenu,
    saveSearch,
    saveCurrentSearch,
    loadSavedSearch,
    deleteSavedSearch,
  };
}
