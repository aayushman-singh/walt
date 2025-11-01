/**
 * Gateway Settings Modal - CDN Integration Management
 * Allows users to view gateway performance and manage custom gateways
 */

import React, { useState, useEffect } from 'react';
import { getGatewayOptimizer, GatewayStats } from '../lib/gatewayOptimizer';
import styles from '../styles/GatewaySettings.module.css';

interface GatewaySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const GatewaySettings: React.FC<GatewaySettingsProps> = ({ isOpen, onClose }) => {
  const [gatewayStats, setGatewayStats] = useState<GatewayStats[]>([]);
  const [customGatewayUrl, setCustomGatewayUrl] = useState('');
  const [customGatewayName, setCustomGatewayName] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const optimizer = getGatewayOptimizer();

  useEffect(() => {
    if (isOpen) {
      loadGatewayStats();
    }
  }, [isOpen]);

  const loadGatewayStats = () => {
    const stats = optimizer.getStats();
    // Sort by performance (best first)
    const sorted = [...stats].sort((a, b) => {
      if (Math.abs(a.successRate - b.successRate) > 0.1) {
        return b.successRate - a.successRate;
      }
      return a.responseTime - b.responseTime;
    });
    setGatewayStats(sorted);
  };

  const handleAddCustomGateway = () => {
    if (!customGatewayUrl.trim()) {
      alert('Please enter a gateway URL');
      return;
    }

    optimizer.addCustomGateway(customGatewayUrl, customGatewayName || undefined);
    loadGatewayStats();
    setCustomGatewayUrl('');
    setCustomGatewayName('');
  };

  const handleRemoveCustomGateway = (url: string) => {
    if (confirm('Remove this custom gateway?')) {
      optimizer.removeCustomGateway(url);
      loadGatewayStats();
    }
  };

  const handleHealthCheck = async () => {
    setIsChecking(true);
    try {
      await optimizer.performHealthCheck();
      loadGatewayStats();
    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const formatResponseTime = (time: number): string => {
    if (time === Infinity) return 'Never tested';
    if (time < 1000) return `${Math.round(time)}ms`;
    return `${(time / 1000).toFixed(2)}s`;
  };

  const formatSuccessRate = (rate: number): string => {
    return `${(rate * 100).toFixed(1)}%`;
  };

  const getPerformanceColor = (stats: GatewayStats): string => {
    if (stats.successRate < 0.5) return '#ff4444';
    if (stats.successRate < 0.8) return '#ffaa00';
    if (stats.responseTime < 500) return '#00cc00';
    if (stats.responseTime < 1500) return '#88cc00';
    return '#ffaa00';
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Gateway Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>Gateway Performance</h3>
              <button 
                className={styles.healthCheckBtn}
                onClick={handleHealthCheck}
                disabled={isChecking}
              >
                {isChecking ? 'Checking...' : '🔍 Check Health'}
              </button>
            </div>

            <div className={styles.statsList}>
              {gatewayStats.length === 0 ? (
                <p className={styles.emptyMessage}>No gateway statistics available</p>
              ) : (
                gatewayStats.map((stats) => (
                  <div key={stats.url} className={styles.statItem}>
                    <div className={styles.statHeader}>
                      <div>
                        <span className={styles.statName}>{stats.name}</span>
                        <span className={styles.statUrl}>{stats.url}</span>
                      </div>
                      <div 
                        className={styles.performanceBadge}
                        style={{ backgroundColor: getPerformanceColor(stats) }}
                      >
                        {stats.successRate >= 0.8 && stats.responseTime < 1500 ? '✓ Fast' : 
                         stats.successRate >= 0.5 ? '⚠ Slow' : '✗ Unreliable'}
                      </div>
                    </div>
                    <div className={styles.statMetrics}>
                      <div className={styles.metric}>
                        <span className={styles.metricLabel}>Response Time:</span>
                        <span className={styles.metricValue}>{formatResponseTime(stats.responseTime)}</span>
                      </div>
                      <div className={styles.metric}>
                        <span className={styles.metricLabel}>Success Rate:</span>
                        <span className={styles.metricValue}>{formatSuccessRate(stats.successRate)}</span>
                      </div>
                      <div className={styles.metric}>
                        <span className={styles.metricLabel}>Requests:</span>
                        <span className={styles.metricValue}>
                          {stats.successCount} success, {stats.failureCount} failed
                        </span>
                      </div>
                      {stats.lastChecked > 0 && (
                        <div className={styles.metric}>
                          <span className={styles.metricLabel}>Last Checked:</span>
                          <span className={styles.metricValue}>
                            {new Date(stats.lastChecked).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                    {stats.url.includes('custom') && (
                      <button
                        className={styles.removeBtn}
                        onClick={() => handleRemoveCustomGateway(stats.url)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.section}>
            <h3>Add Custom Gateway</h3>
            <p className={styles.helpText}>
              Add a custom IPFS gateway URL. The URL should end with /ipfs/
            </p>
            <div className={styles.inputGroup}>
              <input
                type="text"
                placeholder="https://gateway.example.com/ipfs/"
                value={customGatewayUrl}
                onChange={(e) => setCustomGatewayUrl(e.target.value)}
                className={styles.input}
              />
              <input
                type="text"
                placeholder="Gateway name (optional)"
                value={customGatewayName}
                onChange={(e) => setCustomGatewayName(e.target.value)}
                className={styles.input}
              />
              <button
                className={styles.addBtn}
                onClick={handleAddCustomGateway}
              >
                Add Gateway
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <h3>About Gateway Optimization</h3>
            <p className={styles.infoText}>
              The system automatically selects the fastest available gateway based on performance metrics.
              Gateways are tested periodically, and the fastest, most reliable gateways are used first.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GatewaySettings;

