/**
 * Gateway Optimizer - CDN Integration
 * Optimizes IPFS gateway selection for faster file delivery
 */

export interface GatewayStats {
  url: string;
  name: string;
  responseTime: number;
  successRate: number;
  lastChecked: number;
  failureCount: number;
  successCount: number;
}

export interface GatewayConfig {
  primary: string[];
  fallback: string[];
  custom?: string[];
}

const DEFAULT_GATEWAYS = [
  { url: 'https://ipfs.io/ipfs/', name: 'IPFS Public Gateway' },
  { url: 'https://dweb.link/ipfs/', name: 'Protocol Labs Gateway' },
  { url: 'https://cloudflare-ipfs.com/ipfs/', name: 'Cloudflare IPFS' },
  { url: 'https://gateway.pinata.cloud/ipfs/', name: 'Pinata Gateway' },
  { url: 'https://ipfs.filebase.io/ipfs/', name: 'Filebase Gateway' },
  { url: 'https://ipfs.infura.io/ipfs/', name: 'Infura Gateway' },
];

class GatewayOptimizer {
  private gatewayStats: Map<string, GatewayStats> = new Map();
  private config: GatewayConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<GatewayConfig>) {
    this.config = {
      primary: config?.primary || DEFAULT_GATEWAYS.slice(0, 3).map(g => g.url),
      fallback: config?.fallback || DEFAULT_GATEWAYS.slice(3).map(g => g.url),
      custom: config?.custom || [],
    };

    // Initialize stats for all gateways
    [...this.config.primary, ...this.config.fallback, ...(this.config.custom || [])].forEach(url => {
      if (!this.gatewayStats.has(url)) {
        this.gatewayStats.set(url, {
          url,
          name: this.getGatewayName(url),
          responseTime: Infinity,
          successRate: 1.0,
          lastChecked: 0,
          failureCount: 0,
          successCount: 0,
        });
      }
    });

    this.loadStats();
    this.startHealthCheck();
  }

  /**
   * Get the name of a gateway from its URL
   */
  private getGatewayName(url: string): string {
    const gateway = DEFAULT_GATEWAYS.find(g => url.startsWith(g.url));
    return gateway?.name || 'Custom Gateway';
  }

  /**
   * Get the fastest available gateway
   */
  getFastestGateway(): string {
    const gateways = this.getRankedGateways();
    return gateways[0]?.url || this.config.primary[0] || DEFAULT_GATEWAYS[0].url;
  }

  /**
   * Get gateways ranked by performance
   */
  getRankedGateways(): GatewayStats[] {
    const stats = Array.from(this.gatewayStats.values())
      .filter(stat => stat.successRate > 0.5) // Filter out unreliable gateways
      .sort((a, b) => {
        // Sort by success rate first, then by response time
        if (Math.abs(a.successRate - b.successRate) > 0.1) {
          return b.successRate - a.successRate;
        }
        return a.responseTime - b.responseTime;
      });

    return stats.length > 0 ? stats : Array.from(this.gatewayStats.values());
  }

  /**
   * Get gateway URL for a file hash with automatic selection
   */
  getGatewayUrl(ipfsHash: string, preferFastest: boolean = true): string {
    const hash = ipfsHash.replace('ipfs://', '');
    const gateway = preferFastest ? this.getFastestGateway() : this.config.primary[0];
    return `${gateway}${hash}`;
  }

  /**
   * Record a successful fetch from a gateway
   */
  recordSuccess(url: string, responseTime: number): void {
    const stats = this.gatewayStats.get(url);
    if (!stats) return;

    stats.successCount++;
    stats.responseTime = (stats.responseTime === Infinity 
      ? responseTime 
      : (stats.responseTime * 0.7 + responseTime * 0.3)); // Exponential moving average
    stats.successRate = stats.successCount / (stats.successCount + stats.failureCount);
    stats.lastChecked = Date.now();

    this.gatewayStats.set(url, stats);
    this.saveStats();
  }

  /**
   * Record a failed fetch from a gateway
   */
  recordFailure(url: string): void {
    const stats = this.gatewayStats.get(url);
    if (!stats) return;

    stats.failureCount++;
    stats.successRate = stats.successCount / (stats.successCount + stats.failureCount);
    stats.lastChecked = Date.now();

    this.gatewayStats.set(url, stats);
    this.saveStats();
  }

  /**
   * Health check a gateway
   */
  async checkGatewayHealth(url: string): Promise<number | null> {
    const testHash = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'; // IPFS welcome page
    const testUrl = `${url}${testHash}`;

    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for health checks

      const response = await fetch(testUrl, { 
        signal: controller.signal,
        method: 'HEAD', // HEAD request is faster
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        this.recordSuccess(url, responseTime);
        return responseTime;
      } else {
        this.recordFailure(url);
        return null;
      }
    } catch (error) {
      this.recordFailure(url);
      return null;
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    if (typeof window === 'undefined') return;

    // Check health every 5 minutes
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 5 * 60 * 1000);

    // Initial health check after 10 seconds
    setTimeout(() => {
      this.performHealthCheck();
    }, 10000);
  }

  /**
   * Perform health check on all gateways
   */
  async performHealthCheck(): Promise<void> {
    const gateways = [...this.config.primary, ...this.config.fallback, ...(this.config.custom || [])];
    
    // Check gateways in parallel (limited to 3 at a time to avoid overwhelming)
    const BATCH_SIZE = 3;
    for (let i = 0; i < gateways.length; i += BATCH_SIZE) {
      const batch = gateways.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(url => this.checkGatewayHealth(url))
      );
    }
  }

  /**
   * Get statistics for all gateways
   */
  getStats(): GatewayStats[] {
    return Array.from(this.gatewayStats.values());
  }

  /**
   * Add a custom gateway
   */
  addCustomGateway(url: string, name?: string): void {
    if (!url.endsWith('/')) {
      url += '/';
    }
    if (!url.endsWith('/ipfs/')) {
      url += 'ipfs/';
    }

    this.config.custom = this.config.custom || [];
    if (!this.config.custom.includes(url)) {
      this.config.custom.push(url);
    }

    if (!this.gatewayStats.has(url)) {
      this.gatewayStats.set(url, {
        url,
        name: name || 'Custom Gateway',
        responseTime: Infinity,
        successRate: 1.0,
        lastChecked: 0,
        failureCount: 0,
        successCount: 0,
      });
    }

    this.saveConfig();
    this.saveStats();
  }

  /**
   * Remove a custom gateway
   */
  removeCustomGateway(url: string): void {
    this.config.custom = (this.config.custom || []).filter(g => g !== url);
    this.gatewayStats.delete(url);
    this.saveConfig();
    this.saveStats();
  }

  /**
   * Load gateway stats from localStorage
   */
  private loadStats(): void {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem('vault_gateway_stats');
      if (saved) {
        const parsed = JSON.parse(saved);
        const statsMap = new Map<string, GatewayStats>();
        
        Object.entries(parsed).forEach(([url, stats]: [string, any]) => {
          statsMap.set(url, stats as GatewayStats);
        });

        // Merge with existing stats
        statsMap.forEach((stats, url) => {
          this.gatewayStats.set(url, stats);
        });
      }

      const savedConfig = localStorage.getItem('vault_gateway_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        this.config = { ...this.config, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load gateway stats:', error);
    }
  }

  /**
   * Save gateway stats to localStorage
   */
  private saveStats(): void {
    if (typeof window === 'undefined') return;

    try {
      const statsObj: Record<string, GatewayStats> = {};
      this.gatewayStats.forEach((stats, url) => {
        statsObj[url] = stats;
      });
      localStorage.setItem('vault_gateway_stats', JSON.stringify(statsObj));
    } catch (error) {
      console.error('Failed to save gateway stats:', error);
    }
  }

  /**
   * Save gateway config to localStorage
   */
  private saveConfig(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem('vault_gateway_config', JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to save gateway config:', error);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

// Singleton instance
let optimizerInstance: GatewayOptimizer | null = null;

export const getGatewayOptimizer = (config?: Partial<GatewayConfig>): GatewayOptimizer => {
  if (!optimizerInstance) {
    optimizerInstance = new GatewayOptimizer(config);
  }
  return optimizerInstance;
};

/**
 * Helper function to generate an optimized gateway URL for an IPFS hash
 */
export const getOptimizedGatewayUrl = (ipfsHashOrUri: string): string => {
  const hash = ipfsHashOrUri.replace('ipfs://', '');
  const optimizer = getGatewayOptimizer();
  const gateway = optimizer.getFastestGateway();
  return `${gateway}${hash}`;
};

export default GatewayOptimizer;

