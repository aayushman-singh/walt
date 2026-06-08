import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { getBackendGatewayUrl, getShareableFileUrl } from '../../lib/shareUtils';

describe('getBackendGatewayUrl', () => {
  const original = process.env.NEXT_PUBLIC_BACKEND_API_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BACKEND_API_URL;
    else process.env.NEXT_PUBLIC_BACKEND_API_URL = original;
  });

  it('strips the ipfs:// prefix and builds a backend gateway url', () => {
    delete process.env.NEXT_PUBLIC_BACKEND_API_URL;
    expect(getBackendGatewayUrl('ipfs://QmHash')).toBe(
      'https://api-walt.aayushman.dev/ipfs/QmHash'
    );
  });

  it('accepts a bare CID unchanged', () => {
    delete process.env.NEXT_PUBLIC_BACKEND_API_URL;
    expect(getBackendGatewayUrl('QmBare')).toBe(
      'https://api-walt.aayushman.dev/ipfs/QmBare'
    );
  });

  it('honors a configured backend url', () => {
    process.env.NEXT_PUBLIC_BACKEND_API_URL = 'https://example.test';
    expect(getBackendGatewayUrl('ipfs://QmX')).toBe('https://example.test/ipfs/QmX');
  });
});

describe('getShareableFileUrl', () => {
  it('prefers ipfsUri over cid', () => {
    delete process.env.NEXT_PUBLIC_BACKEND_API_URL;
    const url = getShareableFileUrl({ ipfsUri: 'ipfs://QmA', cid: 'QmB' });
    expect(url).toBe('https://api-walt.aayushman.dev/ipfs/QmA');
  });

  it('falls back to cid when no ipfsUri', () => {
    delete process.env.NEXT_PUBLIC_BACKEND_API_URL;
    expect(getShareableFileUrl({ cid: 'QmOnly' })).toBe(
      'https://api-walt.aayushman.dev/ipfs/QmOnly'
    );
  });

  it('throws when the file has neither ipfsUri nor cid', () => {
    expect(() => getShareableFileUrl({})).toThrow('File must have ipfsUri or cid');
  });
});
