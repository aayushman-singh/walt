/**
 * Two-Factor Authentication Setup Component
 * Allows users to set up 2FA with TOTP authenticator apps
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { formatBackupCode, isValidTokenFormat } from '../lib/twoFactorAuth';
import styles from '../styles/TwoFactorSetup.module.css';

interface TwoFactorSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onEnabled: () => void;
}

interface SetupData {
  secret: string;
  qrCodeUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({ isOpen, onClose, onEnabled }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'setup' | 'verify' | 'success'>('setup');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verificationToken, setVerificationToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && user) {
      loadSetupData();
    }
  }, [isOpen, user]);

  const loadSetupData = async () => {
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/two-factor/setup', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.enabled) {
          // 2FA already enabled
          setError('Two-factor authentication is already enabled.');
        } else {
          throw new Error(data.error || 'Failed to load 2FA setup');
        }
      } else {
        setSetupData(data);
        setStep('setup');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !setupData) return;

    if (!isValidTokenFormat(verificationToken)) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/two-factor/setup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: verificationToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      setStep('success');
      setSetupData(data);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('setup');
    setVerificationToken('');
    setError('');
    setSetupData(null);
    onClose();
  };

  const handleSuccess = () => {
    onEnabled();
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Two-Factor Authentication</h2>
          <button className={styles.closeBtn} onClick={handleClose}>✕</button>
        </div>

        <div className={styles.content}>
          {loading && step === 'setup' && !setupData ? (
            <div className={styles.loading}>Loading setup...</div>
          ) : step === 'setup' && setupData ? (
            <>
              <div className={styles.section}>
                <h3>Step 1: Scan QR Code</h3>
                <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)</p>
                
                <div className={styles.qrCodeContainer}>
                  <img 
                    src={setupData.qrCodeDataUrl} 
                    alt="2FA QR Code" 
                    className={styles.qrCode}
                  />
                </div>

                <div className={styles.manualEntry}>
                  <p className={styles.manualLabel}>Or enter this code manually:</p>
                  <code className={styles.secretCode}>{setupData.secret}</code>
                </div>
              </div>

              <div className={styles.section}>
                <h3>Step 2: Verify Setup</h3>
                <p>Enter the 6-digit code from your authenticator app to confirm setup:</p>
                
                <form onSubmit={handleVerify} className={styles.verifyForm}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={verificationToken}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setVerificationToken(value);
                      setError('');
                    }}
                    placeholder="000000"
                    className={styles.tokenInput}
                    autoComplete="one-time-code"
                    required
                  />
                  
                  {error && <div className={styles.error}>{error}</div>}
                  
                  <button
                    type="submit"
                    className={styles.verifyBtn}
                    disabled={loading || verificationToken.length !== 6}
                  >
                    {loading ? 'Verifying...' : 'Verify & Enable'}
                  </button>
                </form>
              </div>

              <div className={styles.infoBox}>
                <strong>📱 Popular Authenticator Apps:</strong>
                <ul>
                  <li>Google Authenticator</li>
                  <li>Microsoft Authenticator</li>
                  <li>Authy</li>
                  <li>1Password</li>
                  <li>LastPass Authenticator</li>
                </ul>
              </div>
            </>
          ) : step === 'success' && setupData ? (
            <>
              <div className={styles.successMessage}>
                <div className={styles.successIcon}>✅</div>
                <h3>Two-Factor Authentication Enabled!</h3>
                <p>Your account is now protected with two-factor authentication.</p>
              </div>

              <div className={styles.section}>
                <h3>⚠️ Save Your Backup Codes</h3>
                <p>Store these backup codes in a safe place. You can use them to access your account if you lose your authenticator device.</p>
                
                <div className={styles.backupCodesContainer}>
                  {setupData.backupCodes.map((code, index) => (
                    <div key={index} className={styles.backupCode}>
                      {formatBackupCode(code)}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    const codes = setupData.backupCodes.map(formatBackupCode).join('\n');
                    navigator.clipboard.writeText(codes);
                    alert('Backup codes copied to clipboard!');
                  }}
                  className={styles.copyBtn}
                >
                  📋 Copy All Codes
                </button>
              </div>

              <div className={styles.warningBox}>
                <strong>⚠️ Important:</strong>
                <ul>
                  <li>Backup codes can only be used once</li>
                  <li>Store them securely - they cannot be retrieved later</li>
                  <li>Each code grants full access to your account</li>
                </ul>
              </div>

              <button
                onClick={handleSuccess}
                className={styles.doneBtn}
              >
                Done
              </button>
            </>
          ) : error ? (
            <div className={styles.errorMessage}>
              <p>{error}</p>
              <button onClick={handleClose} className={styles.closeErrorBtn}>
                Close
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default TwoFactorSetup;

