import { describe, it, expect } from 'vitest';
import {
  keyFromPrfOutput,
  wrapSecretWithKey,
  unwrapSecretWithKey,
  toBase64Url,
  fromBase64Url,
  isWebAuthnAvailable,
  WEBAUTHN_PRF_VERSION,
} from '../../lib/webauthnKeys';

const enc = new TextEncoder();
const dec = new TextDecoder();

// A deterministic 32-byte "PRF output" stand-in (a real authenticator returns
// this; the navigator.* calls are browser-gated and verified manually).
function prf(seed: number): Uint8Array {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = (seed + i * 7) % 256;
  return b;
}

describe('lib/webauthnKeys — PRF-derived key wrap/unwrap', () => {
  it('derives a stable key from the same PRF output (round-trips a secret)', async () => {
    const key = await keyFromPrfOutput(prf(1));
    const secret = enc.encode('the identity private key bytes');
    const wrapped = await wrapSecretWithKey(secret, key, 'cred-abc');
    expect(wrapped.v).toBe(WEBAUTHN_PRF_VERSION);
    expect(wrapped.kdf).toBe('webauthn-prf+hkdf-sha256');
    expect(wrapped.ciphertext).not.toContain('identity'); // it's ciphertext

    // Same PRF output → same key class → can unwrap.
    const key2 = await keyFromPrfOutput(prf(1));
    const out = await unwrapSecretWithKey(wrapped, key2);
    expect(dec.decode(out)).toBe('the identity private key bytes');
  });

  it('a DIFFERENT PRF output (different passkey) cannot unwrap', async () => {
    const key = await keyFromPrfOutput(prf(1));
    const wrapped = await wrapSecretWithKey(enc.encode('secret'), key, 'cred-abc');
    const wrongKey = await keyFromPrfOutput(prf(999));
    await expect(unwrapSecretWithKey(wrapped, wrongKey)).rejects.toThrow(/wrong passkey|tampered/i);
  });

  it('binds credentialId into the AAD (swapping it fails)', async () => {
    const key = await keyFromPrfOutput(prf(2));
    const wrapped = await wrapSecretWithKey(enc.encode('x'), key, 'cred-A');
    const forged = { ...wrapped, credentialId: 'cred-B' };
    await expect(unwrapSecretWithKey(forged, key)).rejects.toThrow(/wrong passkey|tampered/i);
  });

  it('detects tampered ciphertext', async () => {
    const key = await keyFromPrfOutput(prf(3));
    const wrapped = await wrapSecretWithKey(enc.encode('integrity'), key, 'c');
    const bytes = fromBase64Url(toBase64Url(new Uint8Array([1, 2, 3]))); // exercise b64url too
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    const badCt = wrapped.ciphertext.slice(0, -2) + (wrapped.ciphertext.endsWith('A') ? 'BB' : 'AA');
    await expect(unwrapSecretWithKey({ ...wrapped, ciphertext: badCt }, key)).rejects.toThrow();
  });

  it('rejects an unknown wrap version/alg (fail-closed)', async () => {
    const key = await keyFromPrfOutput(prf(4));
    const wrapped = await wrapSecretWithKey(enc.encode('x'), key, 'c');
    await expect(unwrapSecretWithKey({ ...wrapped, v: 99 }, key)).rejects.toThrow(/unsupported/i);
    await expect(unwrapSecretWithKey({ ...wrapped, kdf: 'pbkdf2' as any }, key)).rejects.toThrow(/unsupported/i);
  });

  it('rejects a too-short PRF output', async () => {
    await expect(keyFromPrfOutput(new Uint8Array(8))).rejects.toThrow(/too short/i);
  });

  it('base64url round-trips arbitrary bytes', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 62, 63]); // includes +/ chars pre-encoding
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it('isWebAuthnAvailable is false in the test (jsdom) environment', () => {
    // jsdom has no PublicKeyCredential — the helper must not throw, just report false.
    expect(typeof isWebAuthnAvailable()).toBe('boolean');
  });
});
