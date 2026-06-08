/**
 * Component tests for the ShareModal's encrypted-recipient section.
 *
 * Asserts: the block renders only when the encrypted-share callbacks are passed
 * (additive — existing callers are unaffected); a resolved recipient becomes a
 * removable chip; an unresolved email shows the loud "no walt identity" message
 * with no chip added; and "Share encrypted" forwards the recipients.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ShareModal, { type EncryptedRecipient } from '../../components/ShareModal';

const fakeKey = { type: 'public' } as unknown as CryptoKey;

const baseProps = {
  fileName: 'memo.txt',
  isOpen: true,
  onClose: vi.fn(),
  onShare: vi.fn(async () => 'share-id'),
  onDisableShare: vi.fn(async () => true),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ShareModal — encrypted recipient section', () => {
  it('is hidden when no encrypted-share callbacks are provided (back-compat)', () => {
    render(<ShareModal {...baseProps} />);
    expect(screen.queryByTestId('encrypted-share-section')).not.toBeInTheDocument();
  });

  it('renders the encrypted block when callbacks are provided', () => {
    render(
      <ShareModal
        {...baseProps}
        onResolveRecipient={vi.fn(async () => null)}
        onShareEncrypted={vi.fn(async () => undefined)}
      />
    );
    expect(screen.getByTestId('encrypted-share-section')).toBeInTheDocument();
    expect(screen.getByLabelText(/recipient email/i)).toBeInTheDocument();
  });

  it('adds a resolved recipient as a removable chip', async () => {
    const resolved: EncryptedRecipient = { id: 'bob-uid', email: 'bob@walt.dev', publicKey: fakeKey };
    const onResolveRecipient = vi.fn(async () => resolved);

    render(
      <ShareModal
        {...baseProps}
        onResolveRecipient={onResolveRecipient}
        onShareEncrypted={vi.fn(async () => undefined)}
      />
    );

    fireEvent.change(screen.getByLabelText(/recipient email/i), { target: { value: 'bob@walt.dev' } });
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));

    await waitFor(() => expect(onResolveRecipient).toHaveBeenCalledWith('bob@walt.dev'));
    const chips = await screen.findByTestId('recipient-chips');
    expect(chips).toHaveTextContent('bob@walt.dev');

    // removable
    fireEvent.click(screen.getByRole('button', { name: /remove bob@walt.dev/i }));
    await waitFor(() => expect(screen.queryByTestId('recipient-chips')).not.toBeInTheDocument());
  });

  it('shows the loud "no walt identity" message and adds no chip when unresolved', async () => {
    const onResolveRecipient = vi.fn(async () => null);

    render(
      <ShareModal
        {...baseProps}
        onResolveRecipient={onResolveRecipient}
        onShareEncrypted={vi.fn(async () => undefined)}
      />
    );

    fireEvent.change(screen.getByLabelText(/recipient email/i), { target: { value: 'ghost@nowhere.dev' } });
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no walt identity found for "ghost@nowhere.dev"/i);
    expect(screen.queryByTestId('recipient-chips')).not.toBeInTheDocument();
  });

  it('forwards added recipients to onShareEncrypted', async () => {
    const resolved: EncryptedRecipient = { id: 'bob-uid', email: 'bob@walt.dev', publicKey: fakeKey };
    const onShareEncrypted = vi.fn(async () => undefined);

    render(
      <ShareModal
        {...baseProps}
        onResolveRecipient={vi.fn(async () => resolved)}
        onShareEncrypted={onShareEncrypted}
      />
    );

    fireEvent.change(screen.getByLabelText(/recipient email/i), { target: { value: 'bob@walt.dev' } });
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));
    await screen.findByTestId('recipient-chips');

    fireEvent.click(screen.getByRole('button', { name: /share encrypted/i }));

    await waitFor(() => expect(onShareEncrypted).toHaveBeenCalledTimes(1));
    expect(onShareEncrypted.mock.calls[0][0]).toEqual([resolved]);
  });
});
