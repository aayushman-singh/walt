/**
 * "Shared with you" view — the recipient surface for end-to-end encrypted files.
 *
 * Lists the records in the current user's encrypted inbox (sharedWithMe) and lets
 * them decrypt + download each one. Decryption needs the user's sharing-identity
 * passphrase, prompted inline per download. A wrong passphrase fails loudly (the
 * underlying crypto throws); there is no silent fallback.
 */
import React, { useEffect, useState } from 'react';
import type { SharedRecord } from './hooks/useEncryptedShare';

interface SharedWithYouProps {
  records: SharedRecord[];
  loading: boolean;
  load: () => Promise<void>;
  onDownload: (record: SharedRecord, passphrase: string) => Promise<void>;
  formatFileSize: (bytes?: number) => string;
}

const SharedWithYou: React.FC<SharedWithYouProps> = ({ records, loading, load, onDownload, formatFileSize }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Load the inbox when the view mounts.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitDownload = async (record: SharedRecord) => {
    if (!passphrase) return;
    setBusyId(record.shareId);
    try {
      await onDownload(record, passphrase);
      setActiveId(null);
      setPassphrase('');
    } catch {
      // The hook surfaces the real error via a toast; keep the prompt open.
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: '1rem' }} data-testid="shared-with-you">
      <h2 style={{ margin: '0 0 0.25rem' }}>Shared with you</h2>
      <p style={{ color: '#6b7280', marginTop: 0 }}>
        Files other walt users encrypted to your key. Only you can decrypt them.
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : records.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>Nothing shared with you yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {records.map((record) => (
            <li
              key={record.shareId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                padding: '0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                marginBottom: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{record.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    From {record.fromEmail || record.from} · {formatFileSize(record.size)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(activeId === record.shareId ? null : record.shareId);
                    setPassphrase('');
                  }}
                  style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer' }}
                >
                  {activeId === record.shareId ? 'Cancel' : 'Decrypt & download'}
                </button>
              </div>

              {activeId === record.shareId && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="password"
                    placeholder="Your sharing passphrase"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void submitDownload(record);
                      }
                    }}
                    aria-label="Sharing passphrase"
                    style={{ flex: 1, padding: '0.4rem', borderRadius: 6, border: '1px solid #d1d5db' }}
                  />
                  <button
                    type="button"
                    onClick={() => void submitDownload(record)}
                    disabled={!passphrase || busyId === record.shareId}
                    style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: 0, background: '#4f46e5', color: 'white', cursor: 'pointer' }}
                  >
                    {busyId === record.shareId ? 'Decrypting…' : 'Download'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SharedWithYou;
