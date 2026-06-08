import { describe, it, expect } from 'vitest';
import {
  formatFileSize,
  formatDate,
  formatChargeAmount,
} from '../../components/dashboard/utils';

describe('formatFileSize', () => {
  it('returns "Unknown size" for undefined / 0 / falsy', () => {
    expect(formatFileSize(undefined)).toBe('Unknown size');
    expect(formatFileSize(0)).toBe('Unknown size');
  });

  it('formats bytes below 1 KiB as B', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats KiB with one decimal', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats MiB with one decimal for large sizes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('formatDate', () => {
  it('returns an em dash for missing or invalid dates', () => {
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('formats a valid ISO date to a non-empty string', () => {
    const out = formatDate('2024-03-15T12:00:00.000Z');
    expect(out).not.toBe('—');
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('formatChargeAmount', () => {
  it('returns empty string when status is null/undefined', () => {
    expect(formatChargeAmount(null)).toBe('');
    expect(formatChargeAmount(undefined)).toBe('');
  });

  it('formats an INR charge when chargeAmountINR > 0', () => {
    expect(formatChargeAmount({ chargeAmountINR: 49.5 } as any)).toBe('₹49.50');
  });

  it('falls back to USD overage when there is no INR charge', () => {
    const status = {
      chargeAmountINR: 0,
      monthlyCostUSD: 12,
      freeTierLimitUSD: 10,
    } as any;
    expect(formatChargeAmount(status)).toBe('$2.00');
  });

  it('clamps negative overage to $0.00', () => {
    const status = {
      chargeAmountINR: 0,
      monthlyCostUSD: 3,
      freeTierLimitUSD: 10,
    } as any;
    expect(formatChargeAmount(status)).toBe('$0.00');
  });
});
