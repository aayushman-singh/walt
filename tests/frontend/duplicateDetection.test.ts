import { describe, it, expect } from 'vitest';
import {
  detectContentDuplicates,
  detectNameSizeDuplicates,
  checkNewFileForDuplicates,
} from '../../lib/duplicateDetection';

// Minimal UploadedFile-shaped factory (only fields the functions read).
const f = (over: Record<string, any>) =>
  ({
    isFolder: false,
    trashed: false,
    parentFolderId: null,
    ...over,
  }) as any;

describe('detectContentDuplicates', () => {
  it('returns no duplicates when all CIDs are unique', () => {
    const files = [
      f({ id: '1', ipfsUri: 'ipfs://A' }),
      f({ id: '2', ipfsUri: 'ipfs://B' }),
    ];
    expect(detectContentDuplicates(files)).toEqual([]);
  });

  it('flags every file sharing a CID as high-confidence content duplicate', () => {
    const files = [
      f({ id: '1', ipfsUri: 'ipfs://SAME' }),
      f({ id: '2', ipfsUri: 'ipfs://SAME' }),
    ];
    const dupes = detectContentDuplicates(files);
    expect(dupes).toHaveLength(2);
    expect(dupes[0].confidence).toBe('high');
    expect(dupes[0].reason).toBe('content');
    expect(dupes[0].matches).toHaveLength(1);
    expect(dupes[0].matches[0].id).toBe('2');
  });

  it('ignores folders and files without a CID', () => {
    const files = [
      f({ id: '1', isFolder: true, ipfsUri: 'ipfs://X' }),
      f({ id: '2', ipfsUri: undefined }),
    ];
    expect(detectContentDuplicates(files)).toEqual([]);
  });
});

describe('detectNameSizeDuplicates', () => {
  it('groups by name+size+type (case-insensitive) as medium confidence when CIDs differ', () => {
    const files = [
      f({ id: '1', name: 'doc.txt', size: 100, type: 'text/plain', ipfsUri: 'ipfs://A' }),
      f({ id: '2', name: 'Doc.TXT', size: 100, type: 'text/plain', ipfsUri: 'ipfs://B' }),
    ];
    const dupes = detectNameSizeDuplicates(files, null);
    expect(dupes).toHaveLength(2);
    expect(dupes[0].confidence).toBe('medium');
    expect(dupes[0].reason).toBe('name-size');
  });

  it('escalates to high confidence when the matched files share a CID', () => {
    const files = [
      f({ id: '1', name: 'doc.txt', size: 100, type: 'text/plain', ipfsUri: 'ipfs://SAME' }),
      f({ id: '2', name: 'doc.txt', size: 100, type: 'text/plain', ipfsUri: 'ipfs://SAME' }),
    ];
    const dupes = detectNameSizeDuplicates(files, null);
    expect(dupes[0].confidence).toBe('high');
    expect(dupes[0].reason).toBe('content');
  });

  it('does not match across different folders', () => {
    const files = [
      f({ id: '1', name: 'a.txt', size: 1, type: 't', parentFolderId: 'A' }),
      f({ id: '2', name: 'a.txt', size: 1, type: 't', parentFolderId: 'B' }),
    ];
    expect(detectNameSizeDuplicates(files, 'A')).toEqual([]);
  });
});

describe('checkNewFileForDuplicates', () => {
  it('returns a high-confidence content match when CID already exists', () => {
    const existing = [f({ id: '1', ipfsUri: 'ipfs://DUP' })];
    const matches = checkNewFileForDuplicates(existing, {
      name: 'new.txt',
      type: 'text/plain',
      ipfsUri: 'ipfs://DUP',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe('high');
  });

  it('returns no matches for a genuinely new file', () => {
    const existing = [f({ id: '1', name: 'old.txt', size: 5, type: 't', ipfsUri: 'ipfs://OLD' })];
    const matches = checkNewFileForDuplicates(existing, {
      name: 'brand-new.txt',
      size: 99,
      type: 't',
      ipfsUri: 'ipfs://NEW',
    });
    expect(matches).toEqual([]);
  });
});
