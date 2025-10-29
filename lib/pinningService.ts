// Pinning Service Integration for IPFS
// Supports multiple pinning providers (Pinata, Web3.Storage, etc.)

export interface PinningConfig {
  service: 'pinata' | 'web3storage' | 'filebase' | 'local';
  apiKey?: string;
  apiSecret?: string;
}

export interface PinMetadata {
  name: string;
  keyvalues?: Record<string, string | number>;
}

export interface PinResponse {
  success: boolean;
  ipfsHash: string;
  pinSize?: number;
  timestamp: number;
  error?: string;
}

export interface UnpinResponse {
  success: boolean;
  error?: string;
}

export interface PinStatus {
  isPinned: boolean;
  pinDate?: number;
  pinService?: string;
  pinExpiry?: number;
  pinSize?: number;
}

class PinningService {
  private config: PinningConfig;

  constructor(config: PinningConfig) {
    this.config = config;
  }

  /**
   * Pin a file to IPFS using the configured service
   */
  async pinFile(file: File, metadata?: PinMetadata): Promise<PinResponse> {
    switch (this.config.service) {
      case 'pinata':
        return this.pinWithPinata(file, metadata);
      case 'web3storage':
        return this.pinWithWeb3Storage(file, metadata);
      case 'local':
        // For local/thirdweb storage, we consider it "pinned" by default
        return {
          success: true,
          ipfsHash: '',
          timestamp: Date.now()
        };
      default:
        return {
          success: false,
          ipfsHash: '',
          timestamp: Date.now(),
          error: 'Unsupported pinning service'
        };
    }
  }

  /**
   * Pin an existing IPFS hash
   */
  async pinByHash(ipfsHash: string, metadata?: PinMetadata): Promise<PinResponse> {
    const hash = ipfsHash.replace('ipfs://', '');
    
    switch (this.config.service) {
      case 'pinata':
        return this.pinHashWithPinata(hash, metadata);
      case 'local':
        return {
          success: true,
          ipfsHash: hash,
          timestamp: Date.now()
        };
      default:
        return {
          success: false,
          ipfsHash: hash,
          timestamp: Date.now(),
          error: 'Unsupported pinning service'
        };
    }
  }

  /**
   * Unpin a file from IPFS
   */
  async unpinFile(ipfsHash: string): Promise<UnpinResponse> {
    const hash = ipfsHash.replace('ipfs://', '');

    switch (this.config.service) {
      case 'pinata':
        return this.unpinWithPinata(hash);
      case 'local':
        return { success: true };
      default:
        return {
          success: false,
          error: 'Unsupported pinning service'
        };
    }
  }

  /**
   * Check pin status of an IPFS hash
   */
  async getPinStatus(ipfsHash: string): Promise<PinStatus> {
    const hash = ipfsHash.replace('ipfs://', '');

    switch (this.config.service) {
      case 'pinata':
        return this.getPinataStatus(hash);
      case 'local':
        return {
          isPinned: true,
          pinDate: Date.now(),
          pinService: 'local'
        };
      default:
        return { isPinned: false };
    }
  }

  // Pinata implementation
  private async pinWithPinata(file: File, metadata?: PinMetadata): Promise<PinResponse> {
    if (!this.config.apiKey || !this.config.apiSecret) {
      return {
        success: false,
        ipfsHash: '',
        timestamp: Date.now(),
        error: 'Pinata API credentials not configured'
      };
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      if (metadata) {
        const pinataMetadata = {
          name: metadata.name,
          keyvalues: metadata.keyvalues || {}
        };
        formData.append('pinataMetadata', JSON.stringify(pinataMetadata));
      }

      const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'pinata_api_key': this.config.apiKey,
          'pinata_secret_api_key': this.config.apiSecret
        },
        body: formData
      });

      const result = await response.json();

      if (response.ok && result.IpfsHash) {
        return {
          success: true,
          ipfsHash: result.IpfsHash,
          pinSize: result.PinSize,
          timestamp: Date.now()
        };
      }

      return {
        success: false,
        ipfsHash: '',
        timestamp: Date.now(),
        error: result.error?.details || 'Pinata upload failed'
      };
    } catch (error: any) {
      return {
        success: false,
        ipfsHash: '',
        timestamp: Date.now(),
        error: error.message || 'Network error'
      };
    }
  }

  private async pinHashWithPinata(hash: string, metadata?: PinMetadata): Promise<PinResponse> {
    if (!this.config.apiKey || !this.config.apiSecret) {
      return {
        success: false,
        ipfsHash: hash,
        timestamp: Date.now(),
        error: 'Pinata API credentials not configured'
      };
    }

    try {
      const body: any = {
        hashToPin: hash
      };

      if (metadata) {
        body.pinataMetadata = {
          name: metadata.name,
          keyvalues: metadata.keyvalues || {}
        };
      }

      const response = await fetch('https://api.pinata.cloud/pinning/pinByHash', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': this.config.apiKey,
          'pinata_secret_api_key': this.config.apiSecret
        },
        body: JSON.stringify(body)
      });

      const result = await response.json();

      if (response.ok) {
        return {
          success: true,
          ipfsHash: hash,
          timestamp: Date.now()
        };
      }

      return {
        success: false,
        ipfsHash: hash,
        timestamp: Date.now(),
        error: result.error?.details || 'Pinata pin by hash failed'
      };
    } catch (error: any) {
      return {
        success: false,
        ipfsHash: hash,
        timestamp: Date.now(),
        error: error.message || 'Network error'
      };
    }
  }

  private async unpinWithPinata(hash: string): Promise<UnpinResponse> {
    if (!this.config.apiKey || !this.config.apiSecret) {
      return {
        success: false,
        error: 'Pinata API credentials not configured'
      };
    }

    try {
      const response = await fetch(`https://api.pinata.cloud/pinning/unpin/${hash}`, {
        method: 'DELETE',
        headers: {
          'pinata_api_key': this.config.apiKey,
          'pinata_secret_api_key': this.config.apiSecret
        }
      });

      if (response.ok) {
        return { success: true };
      }

      const result = await response.json();
      return {
        success: false,
        error: result.error?.details || 'Pinata unpin failed'
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  private async getPinataStatus(hash: string): Promise<PinStatus> {
    if (!this.config.apiKey || !this.config.apiSecret) {
      return { isPinned: false };
    }

    try {
      const response = await fetch(
        `https://api.pinata.cloud/data/pinList?hashContains=${hash}&status=pinned`,
        {
          headers: {
            'pinata_api_key': this.config.apiKey,
            'pinata_secret_api_key': this.config.apiSecret
          }
        }
      );

      const result = await response.json();

      if (response.ok && result.rows && result.rows.length > 0) {
        const pin = result.rows[0];
        return {
          isPinned: true,
          pinDate: new Date(pin.date_pinned).getTime(),
          pinService: 'pinata',
          pinSize: pin.size
        };
      }

      return { isPinned: false };
    } catch (error) {
      return { isPinned: false };
    }
  }

  private async pinWithWeb3Storage(file: File, metadata?: PinMetadata): Promise<PinResponse> {
    // Web3.Storage implementation would go here
    // For now, return not implemented
    return {
      success: false,
      ipfsHash: '',
      timestamp: Date.now(),
      error: 'Web3.Storage integration not yet implemented'
    };
  }
}

// Singleton instance
let pinningServiceInstance: PinningService | null = null;

export const initPinningService = (config: PinningConfig): PinningService => {
  pinningServiceInstance = new PinningService(config);
  return pinningServiceInstance;
};

export const getPinningService = (): PinningService | null => {
  return pinningServiceInstance;
};

// Helper function to get config from environment
export const getPinningConfigFromEnv = (): PinningConfig => {
  const service = process.env.NEXT_PUBLIC_PINNING_SERVICE as PinningConfig['service'] || 'local';
  
  return {
    service,
    apiKey: process.env.NEXT_PUBLIC_PINATA_API_KEY,
    apiSecret: process.env.NEXT_PUBLIC_PINATA_API_SECRET
  };
};

// Calculate storage costs (example pricing)
export const calculatePinningCost = (fileSizeBytes: number, durationDays: number = 365): string => {
  const sizeGB = fileSizeBytes / (1024 * 1024 * 1024);
  
  // Example pricing (adjust based on actual service)
  // Pinata: ~$0.15/GB/month for first tier
  const monthlyGBCost = 0.15;
  const months = durationDays / 30;
  const totalCost = sizeGB * monthlyGBCost * months;
  
  if (totalCost < 0.01) {
    return '< $0.01';
  }
  
  return `~$${totalCost.toFixed(2)}`;
};

// Check if a pin is expired
export const isPinExpired = (pinExpiry?: number): boolean => {
  if (!pinExpiry) return false;
  return Date.now() > pinExpiry;
};

// Get days until expiry
export const getDaysUntilExpiry = (pinExpiry?: number): number | null => {
  if (!pinExpiry) return null;
  const diff = pinExpiry - Date.now();
  if (diff < 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

