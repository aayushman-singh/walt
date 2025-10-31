import React, { useState, useEffect } from 'react';
import styles from '../styles/TagManager.module.css';

interface TagManagerProps {
  fileId: string;
  currentTags: string[];
  allTags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onClose: () => void;
}

const TagManager: React.FC<TagManagerProps> = ({
  fileId,
  currentTags,
  allTags,
  onAddTag,
  onRemoveTag,
  onClose
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (inputValue.trim().length > 0) {
      const query = inputValue.toLowerCase();
      const filtered = allTags
        .filter(tag => 
          tag.toLowerCase().includes(query) && 
          !currentTags.some(ct => ct.toLowerCase() === tag.toLowerCase())
        )
        .slice(0, 5);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0 || inputValue.trim().length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [inputValue, allTags, currentTags]);

  const handleAddTag = (tag?: string) => {
    const tagToAdd = (tag || inputValue.trim()).toLowerCase();
    if (tagToAdd.length > 0 && !currentTags.some(t => t.toLowerCase() === tagToAdd)) {
      onAddTag(tagToAdd);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim().length > 0) {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>🏷️ Manage Tags</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.content}>
          <div className={styles.inputSection}>
            <label>Add Tag</label>
            <div className={styles.inputWrapper}>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                onFocus={() => setShowSuggestions(inputValue.trim().length > 0)}
                placeholder="Type tag name..."
                className={styles.tagInput}
              />
              <button
                onClick={() => handleAddTag()}
                disabled={inputValue.trim().length === 0}
                className={styles.addBtn}
              >
                Add
              </button>
            </div>

            {showSuggestions && (
              <div className={styles.suggestions}>
                {suggestions.map((tag) => (
                  <button
                    key={tag}
                    className={styles.suggestionItem}
                    onClick={() => handleAddTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
                {inputValue.trim().length > 0 && 
                 !suggestions.some(s => s === inputValue.trim().toLowerCase()) && 
                 !currentTags.some(ct => ct.toLowerCase() === inputValue.trim().toLowerCase()) && (
                  <button
                    className={styles.suggestionItem}
                    onClick={() => handleAddTag()}
                  >
                    + Create "{inputValue.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={styles.currentTags}>
            <label>Current Tags</label>
            {currentTags.length === 0 ? (
              <div className={styles.emptyTags}>No tags yet</div>
            ) : (
              <div className={styles.tagsList}>
                {currentTags.map((tag) => (
                  <div key={tag} className={styles.tag}>
                    <span>{tag}</span>
                    <button
                      className={styles.removeTagBtn}
                      onClick={() => onRemoveTag(tag)}
                      title="Remove tag"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {allTags.length > 0 && (
            <div className={styles.allTags}>
              <label>All Tags</label>
              <div className={styles.allTagsList}>
                {allTags.slice(0, 20).map((tag) => {
                  const isAdded = currentTags.some(ct => ct.toLowerCase() === tag.toLowerCase());
                  return (
                    <button
                      key={tag}
                      className={`${styles.tagChip} ${isAdded ? styles.added : ''}`}
                      onClick={() => isAdded ? onRemoveTag(tag) : onAddTag(tag)}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TagManager;

