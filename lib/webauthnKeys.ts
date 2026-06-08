/**
 * Passkey-derived encryption keys (WebAuthn PRF / hmac-secret).
 *
 * "The device is the key." Instead of remembering a passphrase, the user unlocks
 * their walt encryption with a passkey: the authenticator's **PRF extension**
 * (CTAP2 `hmac-secret`) returns a high-entropy secret bound to the credential,
 * which we run through HKDF to an AES-256-GCM key-encryption key. That key can
 * wrap the same things a passphrase does (e.g. the ECDH identity private key).
 *
 * Hard rule — NO silent fallback: if the authenticator/browser doesn't support
 * PRF, registration/derivation throws a clear error telling the user to use the
 * passphrase path. We never quietly substitute a passphrase or a weaker secret.
 *
 * What is unit-testable here: the PRF-output → HKDF → key derivation and the
 * AES-GCM wrap/unwrap (pure Web Crypto). The `navigator.credentials` calls are
 * browser+authenticator gated and are verified manually / in a real browser; they
 * are kept as thin, loud wrappers around the tested core.
 */
import { toBase64, fromBase64 } from './encryption';

export const WEBAUTHN_PRF_VERSION = 1;

// A fixed application-scoped PRF salt → the same credential yields a stable key
// for walt. (PRF output = PRF(credential_secret, salt); stable salt ⇒ stable key.)
const PRF_SALT = new TextEncoder().encode('walt-prf-encryption-v1');
const HKDF_INFO = new TextEncoder().encode('walt-webauthn-kek-v1');
const IV_BYTES = 12;

/** A passkey-wrapped secret (e.g. an identity private key) — public/safe to store. */
export interface PrfWrappedSecret {
  v: number;
  alg: 'AES-GCM';
  kdf: 'webauthn-prf+hkdf-sha256';
  /** base64url credentialId needed to re-derive the key from the same passkey. */
  credentialId: string;
  iv: string; // base64
  ciphertext: string; // base64
}

function getSubtle(): SubtleCrypto {
  const c: Crypto | undefined = (globalThis as any).crypto;
  if (!c || !c.subtle) throw new Error('Web Crypto API is unavailable');
  return c.subtle;
}
function randomBytes(n: number): Uint8Array {
  const c: Crypto = (globalThis as any).crypto;
  if (!c?.getRandomValues) throw new Error('Secure RNG unavailable');
  return c.getRandomValues(new Uint8Array(n));
}

// base64url helpers for credential ids (WebAuthn convention).
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((s.length + 3) % 4);
  return fromBase64(b64);
}

/** True if this browser exposes the WebAuthn API surface at all. */
export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).PublicKeyCredential !== 'undefined' &&
    !!navigator?.credentials?.create &&
    !!navigator?.credentials?.get
  );
}

/**
 * Derive an AES-256-GCM key from a PRF output via HKDF-SHA256. Pure + testable.
 */
export async function keyFromPrfOutput(prfOutput: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  const material = prfOutput instanceof Uint8Array ? prfOutput : new Uint8Array(prfOutput);
  if (material.byteLength < 16) throw new Error('PRF output too short to derive a key');
  const hkdf = await subtle.importKey('raw', material as unknown as BufferSource, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: PRF_SALT as unknown as BufferSource, info: HKDF_INFO as unknown as BufferSource },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function wrapAAD(credentialId: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([WEBAUTHN_PRF_VERSION, 'AES-GCM', 'webauthn-prf+hkdf-sha256', credentialId]));
}

/** Wrap secret bytes under a passkey-derived key. Pure + testable. */
export async function wrapSecretWithKey(
  secret: Uint8Array,
  key: CryptoKey,
  credentialId: string
): Promise<PrfWrappedSecret> {
  const subtle = getSubtle();
  const iv = randomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: wrapAAD(credentialId) as unknown as BufferSource },
      key,
      secret as unknown as BufferSource
    )
  );
  return {
    v: WEBAUTHN_PRF_VERSION,
    alg: 'AES-GCM',
    kdf: 'webauthn-prf+hkdf-sha256',
    credentialId,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

/** Unwrap a passkey-wrapped secret. Throws loudly on wrong key / tamper. Pure + testable. */
export async function unwrapSecretWithKey(wrapped: PrfWrappedSecret, key: CryptoKey): Promise<Uint8Array> {
  if (wrapped.v !== WEBAUTHN_PRF_VERSION) throw new Error(`Unsupported passkey-wrap version: ${wrapped.v}`);
  if (wrapped.alg !== 'AES-GCM' || wrapped.kdf !== 'webauthn-prf+hkdf-sha256') {
    throw new Error(`Unsupported passkey-wrap cipher/KDF: ${wrapped.alg}/${wrapped.kdf}`);
  }
  const subtle = getSubtle();
  try {
    const plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(wrapped.iv), additionalData: wrapAAD(wrapped.credentialId) as unknown as BufferSource },
      key,
      fromBase64(wrapped.ciphertext) as unknown as BufferSource
    );
    return new Uint8Array(plain);
  } catch (cause) {
    throw new Error('Passkey unwrap failed — wrong passkey or tampered data', { cause });
  }
}

// ---------------------------------------------------------------------------
// WebAuthn navigator wrappers (browser + authenticator gated; not headless-testable).
// ---------------------------------------------------------------------------

interface RegisterArgs {
  userId: string; // stable user handle (e.g. Firebase uid)
  userName: string; // e.g. email
  displayName?: string;
  rpName?: string;
}

/**
 * Register a passkey and REQUIRE PRF support. Returns the credentialId (base64url).
 * Throws loudly if the authenticator does not support the PRF extension — the
 * caller must then route the user to the passphrase path, NOT silently degrade.
 */
export async function registerPasskey({ userId, userName, displayName, rpName = 'walt' }: RegisterArgs): Promise<{ credentialId: string }> {
  if (!isWebAuthnAvailable()) throw new Error('Passkeys are not supported in this browser');
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: rpName },
      user: { id: new TextEncoder().encode(userId), name: userName, displayName: displayName || userName },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error('Passkey registration was cancelled');
  const ext = cred.getClientExtensionResults() as any;
  // `prf.enabled === true` is the support signal at creation time.
  if (!ext?.prf?.enabled) {
    throw new Error('This authenticator does not support the PRF extension. Use the passphrase option instead.');
  }
  return { credentialId: toBase64Url(new Uint8Array(cred.rawId)) };
}

/**
 * Re-derive the AES-GCM key from an existing passkey via its PRF output.
 * Throws loudly if PRF results are absent (no silent fallback).
 */
export async function derivePasskeyKey(credentialId: string): Promise<CryptoKey> {
  if (!isWebAuthnAvailable()) throw new Error('Passkeys are not supported in this browser');
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: fromBase64Url(credentialId) }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error('Passkey authentication was cancelled');
  // Security-critical: confirm the authenticator answered with the credential we
  // asked for before trusting its PRF output to derive a key.
  if (toBase64Url(new Uint8Array(assertion.rawId)) !== credentialId) {
    throw new Error('Passkey assertion returned an unexpected credential');
  }
  const ext = assertion.getClientExtensionResults() as any;
  const prfFirst: ArrayBuffer | undefined = ext?.prf?.results?.first;
  if (!prfFirst) {
    throw new Error('This authenticator did not return a PRF result. Use the passphrase option instead.');
  }
  return keyFromPrfOutput(prfFirst);
}
