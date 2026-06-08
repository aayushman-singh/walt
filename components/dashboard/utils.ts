/**
 * Pure helpers extracted from pages/dashboard.tsx.
 * Behaviour-identical to the originals — no logic changes.
 */

import {
  getPinningServiceConfig,
  getPinningConfigFromEnv,
  DEFAULT_BILLING_CYCLE_DAYS,
} from '../../lib/pinningService';
import { BillingStatus } from '../../lib/billingClient';

export const BILLING_WARNING_SNOOZE_DAYS = 14;
export const BILLING_WARNING_SNOOZE_MS = BILLING_WARNING_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

export const billingCycleLabel =
  DEFAULT_BILLING_CYCLE_DAYS === 30 ? 'month' : `${DEFAULT_BILLING_CYCLE_DAYS}-day cycle`;
export const billingCycleTitle =
  DEFAULT_BILLING_CYCLE_DAYS === 30 ? 'Monthly' : `${DEFAULT_BILLING_CYCLE_DAYS}-Day Cycle`;

export const getFriendlyPinServiceLabel = (): string => {
  const config = getPinningServiceConfig() || getPinningConfigFromEnv();
  const service = config?.service;
  if (service === 'pinata') return 'pinata';
  if (service === 'backend' || service === 'walt') return 'walt';
  return 'local';
};

export const formatFileSize = (bytes?: number) => {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export const formatDate = (isoDate?: string) => {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatChargeAmount = (status?: BillingStatus | null) => {
  if (!status) return '';
  if (status.chargeAmountINR > 0) {
    return `₹${status.chargeAmountINR.toFixed(2)}`;
  }
  const overageUSD = Math.max(0, status.monthlyCostUSD - status.freeTierLimitUSD);
  return `$${overageUSD.toFixed(2)}`;
};

export const getBillingDayLabel = (status: BillingStatus) => {
  const dateLabel = formatDate(status.nextBillingDate);
  if (dateLabel !== '—') return dateLabel;
  if (status.billingDay) {
    return `day ${status.billingDay}`;
  }
  return 'your billing day';
};

export const formatBillingPeriod = (period?: { start: string; end: string }) => {
  if (!period?.start || !period?.end) return null;
  return `${formatDate(period.start)} - ${formatDate(period.end)}`;
};

export const isTodayBillingDay = (billingDay?: number) => {
  if (typeof billingDay !== 'number' || Number.isNaN(billingDay)) return false;
  const today = new Date();
  return today.getDate() === billingDay;
};
