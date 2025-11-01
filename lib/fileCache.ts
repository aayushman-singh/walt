/**
 * File Cache System
 * Caches file metadata and content for faster access
 */

export interface CachedFileData {
  file: any; // UploadedFile type
  content?: Blob | string; // Cached file content
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheConfig {
  maxSize: number; // Maximum number of files to cache
  maxAge: number; // Maximum age in ms (default 24 hours)
  enabled: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 50, // Cache up to 50 files
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  enabled: true,
};

class FileCache {
  private memoryCache: Map<string, CachedFileData> = new Map();
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
  }

  /**
   * Get a file from cache
   */
  get(fileId: string): CachedFileData | null {
    if (!this.config.enabled) return null;

    const cached = this.memoryCache.get(fileId);
    if (!cached) return null;

    // Check if cache is expired
    const age = Date.now() - cached.timestamp;
    if (age > this.config.maxAge) {
      this.remove(fileId);
      return null;
    }

    // Update access stats
    cached.lastAccessed = Date.now();
    cached.accessCount++;

    return cached;
  }

  /**
   * Store a file in cache
   */
  set(fileId: string, file: any, content?: Blob | string): void {
    if (!this.config.enabled) return;

    // Check cache size and evict if needed
    this.evictIfNeeded();

    const cached: CachedFileData = {
      file,
      content,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    this.memoryCache.set(fileId, cached);
    this.saveToStorage();
  }

  /**
   * Remove a file from cache
   */
  remove(fileId: string): void {
    this.memoryCache.delete(fileId);
    this.saveToStorage();
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.memoryCache.clear();
    this.saveToStorage();
  }

  /**
   * Check if a file is cached
   */
  has(fileId: string): boolean {
    if (!this.config.enabled) return false;
    const cached = this.memoryCache.get(fileId);
    if (!cached) return false;

    // Check expiration
    const age = Date.now() - cached.timestamp;
    if (age > this.config.maxAge) {
      this.remove(fileId);
      return false;
    }

    return true;
  }

  /**
   * Get all cached file IDs (for debugging/management)
   */
  getAllKeys(): string[] {
    // Clean expired entries first
    this.cleanExpired();
    return Array.from(this.memoryCache.keys());
  }

  /**
   * Get cache stats
   */
  getStats() {
    this.cleanExpired();
    const entries = Array.from(this.memoryCache.values());
    
    return {
      size: entries.length,
      maxSize: this.config.maxSize,
      totalAccessCount: entries.reduce((sum, e) => sum + e.accessCount, 0),
      avgAge: entries.length > 0 
        ? entries.reduce((sum, e) => sum + (Date.now() - e.timestamp), 0) / entries.length 
        : 0,
      mostAccessed: entries.length > 0
        ? entries.reduce((max, e) => e.accessCount > max.accessCount ? e : max)
        : null,
    };
  }

  /**
   * Evict least recently used items if cache is full
   */
  private evictIfNeeded(): void {
    if (this.memoryCache.size < this.config.maxSize) return;

    // Sort by last accessed time (LRU)
    const entries = Array.from(this.memoryCache.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => a.lastAccessed - b.lastAccessed);

    // Remove 20% of least recently used items
    const toRemove = Math.max(1, Math.floor(this.config.maxSize * 0.2));
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i].id);
    }
  }

  /**
   * Remove expired entries
   */
  private cleanExpired(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    this.memoryCache.forEach((cached, fileId) => {
      const age = now - cached.timestamp;
      if (age > this.config.maxAge) {
        toRemove.push(fileId);
      }
    });

    toRemove.forEach(id => this.remove(id));
  }

  /**
   * Load cache from localStorage (for persistence across sessions)
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('vault_file_cache');
      if (!stored) return;

      const data = JSON.parse(stored);
      const cacheData: Map<string, CachedFileData> = new Map(data);

      // Only load non-expired entries
      const now = Date.now();
      cacheData.forEach((cached, fileId) => {
        const age = now - cached.timestamp;
        if (age <= this.config.maxAge) {
          this.memoryCache.set(fileId, cached);
        }
      });

      // Limit size
      if (this.memoryCache.size > this.config.maxSize) {
        const entries = Array.from(this.memoryCache.entries())
          .map(([id, data]) => ({ id, ...data }))
          .sort((a, b) => a.lastAccessed - b.lastAccessed);

        const toKeep = this.config.maxSize;
        this.memoryCache.clear();
        entries.slice(-toKeep).forEach(({ id, ...data }) => {
          this.memoryCache.set(id, data as CachedFileData);
        });
      }
    } catch (error) {
      console.error('Failed to load cache from storage:', error);
      this.memoryCache.clear();
    }
  }

  /**
   * Save cache to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      // Clean expired first
      this.cleanExpired();

      // Convert Map to array for JSON serialization
      // Note: We don't store Blob content in localStorage (too large)
      const serializable: Array<[string, Omit<CachedFileData, 'content'>]> = [];
      this.memoryCache.forEach((cached, fileId) => {
        const { content, ...withoutContent } = cached;
        serializable.push([fileId, withoutContent]);
      });

      localStorage.setItem('vault_file_cache', JSON.stringify(Array.from(serializable)));
    } catch (error) {
      console.error('Failed to save cache to storage:', error);
      // If quota exceeded, clear old entries and try again
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.evictIfNeeded();
        try {
          const serializable: Array<[string, Omit<CachedFileData, 'content'>]> = [];
          this.memoryCache.forEach((cached, fileId) => {
            const { content, ...withoutContent } = cached;
            serializable.push([fileId, withoutContent]);
          });
          localStorage.setItem('vault_file_cache', JSON.stringify(Array.from(serializable)));
        } catch (retryError) {
          console.error('Failed to save cache after eviction:', retryError);
        }
      }
    }
  }

  /**
   * Prefetch files that are likely to be accessed
   */
  prefetch(fileIds: string[], files: any[]): void {
    if (!this.config.enabled) return;

    fileIds.forEach((fileId, index) => {
      const file = files[index];
      if (file && !this.has(fileId)) {
        this.set(fileId, file);
      }
    });
  }
}

// Singleton instance
let cacheInstance: FileCache | null = null;

export const getFileCache = (config?: Partial<CacheConfig>): FileCache => {
  if (!cacheInstance) {
    cacheInstance = new FileCache(config);
  }
  return cacheInstance;
};

export const clearFileCache = (): void => {
  if (cacheInstance) {
    cacheInstance.clear();
  }
};

export default FileCache;

