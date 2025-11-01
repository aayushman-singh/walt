/**
 * Two-Factor Authentication Utility
 * Handles TOTP (Time-based One-Time Password) generation and verification
 */

import { authenticator, totp } from 'otplib';

// Configure TOTP settings
authenticator.options = {
  step: 30, // 30 second window
  window: 1, // Allow 1 window tolerance for clock skew
};

totp.options = {
  step: 30,
  window: 1,
};

export interface TwoFactorSecret {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

/**
 * Generate a new 2FA secret for a user
 */
export function generateTwoFactorSecret(userId: string, userEmail: string): TwoFactorSecret {
  const serviceName = 'Vault Labs';
  const accountName = userEmail;

  // Generate secret
  const secret = authenticator.generateSecret();

  // Generate QR code URL (otpauth:// URI)
  const otpAuthUrl = authenticator.keyuri(accountName, serviceName, secret);
  
  // Generate backup codes (8-digit numeric codes)
  const backupCodes = generateBackupCodes(10);

  return {
    secret,
    qrCodeUrl: otpAuthUrl,
    backupCodes,
  };
}

/**
 * Verify a TOTP token against a secret
 */
export function verifyTwoFactorToken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch (error) {
    console.error('2FA verification error:', error);
    return false;
  }
}

/**
 * Verify a backup code
 */
export function verifyBackupCode(providedCode: string, validBackupCodes: string[]): boolean {
  // Normalize the code (remove spaces, convert to uppercase)
  const normalizedCode = providedCode.replace(/\s+/g, '').toUpperCase();
  
  // Check if the code exists in the backup codes array
  const index = validBackupCodes.findIndex(
    code => code.replace(/\s+/g, '').toUpperCase() === normalizedCode
  );
  
  return index !== -1;
}

/**
 * Generate backup codes for account recovery
 */
function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    // Generate 8-digit code
    const code = Math.floor(10000000 + Math.random() * 90000000).toString();
    codes.push(code);
  }
  
  return codes;
}

/**
 * Format backup codes for display (add spacing for readability)
 */
export function formatBackupCode(code: string): string {
  // Format as XXXX-XXXX
  return code.replace(/(\d{4})(\d{4})/, '$1-$2');
}

/**
 * Validate token format (6 digits)
 */
export function isValidTokenFormat(token: string): boolean {
  return /^\d{6}$/.test(token);
}

/**
 * Validate backup code format (8 digits)
 */
export function isValidBackupCodeFormat(code: string): boolean {
  // Allow with or without dashes
  const cleaned = code.replace(/-/g, '');
  return /^\d{8}$/.test(cleaned);
}

