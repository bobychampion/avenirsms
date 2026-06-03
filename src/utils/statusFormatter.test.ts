/**
 * Unit Tests for Status Formatting Utilities
 * 
 * Tests cover:
 * - Relative time formatting for various time ranges
 * - Expiration time formatting for future and past times
 * - Absolute time formatting
 * - Status code to label conversion
 * - Status label to code conversion (round-trip property)
 * - Workspace domain link formatting
 * - Error message formatting with punctuation
 */

import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  formatRelativeTime,
  formatExpirationTime,
  formatAbsoluteTime,
  formatStatus,
  parseStatus,
  formatWorkspaceDomain,
  formatErrorMessage,
  type ServiceStatus,
} from './statusFormatter';

describe('statusFormatter', () => {
  describe('formatRelativeTime', () => {
    it('should format timestamps less than 1 minute as "just now"', () => {
      const now = Date.now();
      const timestamp = Timestamp.fromMillis(now - 30 * 1000); // 30 seconds ago
      expect(formatRelativeTime(timestamp)).toBe('just now');
    });

    it('should format timestamps in minutes', () => {
      const now = Date.now();
      const timestamp1 = Timestamp.fromMillis(now - 1 * 60 * 1000); // 1 minute ago
      const timestamp2 = Timestamp.fromMillis(now - 5 * 60 * 1000); // 5 minutes ago
      
      expect(formatRelativeTime(timestamp1)).toBe('1 minute ago');
      expect(formatRelativeTime(timestamp2)).toBe('5 minutes ago');
    });

    it('should format timestamps in hours', () => {
      const now = Date.now();
      const timestamp1 = Timestamp.fromMillis(now - 1 * 60 * 60 * 1000); // 1 hour ago
      const timestamp2 = Timestamp.fromMillis(now - 3 * 60 * 60 * 1000); // 3 hours ago
      
      expect(formatRelativeTime(timestamp1)).toBe('1 hour ago');
      expect(formatRelativeTime(timestamp2)).toBe('3 hours ago');
    });

    it('should format timestamps in days', () => {
      const now = Date.now();
      const timestamp1 = Timestamp.fromMillis(now - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const timestamp2 = Timestamp.fromMillis(now - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      
      expect(formatRelativeTime(timestamp1)).toBe('1 day ago');
      expect(formatRelativeTime(timestamp2)).toBe('5 days ago');
    });

    it('should format timestamps in months', () => {
      const now = Date.now();
      const timestamp1 = Timestamp.fromMillis(now - 30 * 24 * 60 * 60 * 1000); // ~1 month ago
      const timestamp2 = Timestamp.fromMillis(now - 90 * 24 * 60 * 60 * 1000); // ~3 months ago
      
      expect(formatRelativeTime(timestamp1)).toBe('1 month ago');
      expect(formatRelativeTime(timestamp2)).toBe('3 months ago');
    });

    it('should format timestamps in years', () => {
      const now = Date.now();
      const timestamp1 = Timestamp.fromMillis(now - 365 * 24 * 60 * 60 * 1000); // 1 year ago
      const timestamp2 = Timestamp.fromMillis(now - 730 * 24 * 60 * 60 * 1000); // 2 years ago
      
      expect(formatRelativeTime(timestamp1)).toBe('1 year ago');
      expect(formatRelativeTime(timestamp2)).toBe('2 years ago');
    });

    it('should handle future timestamps gracefully', () => {
      const now = Date.now();
      const timestamp = Timestamp.fromMillis(now + 60 * 1000); // 1 minute in future
      expect(formatRelativeTime(timestamp)).toBe('just now');
    });
  });

  describe('formatExpirationTime', () => {
    it('should format future timestamps with "expires in"', () => {
      const now = Date.now();
      const timestamp1 = Timestamp.fromMillis(now + 45 * 60 * 1000); // 45 minutes from now
      const timestamp2 = Timestamp.fromMillis(now + 2 * 60 * 60 * 1000); // 2 hours from now
      
      // Use regex to handle timing variations (44-45 minutes is acceptable)
      expect(formatExpirationTime(timestamp1)).toMatch(/expires in (44|45) minutes/);
      // Use regex to handle timing variations (1-2 hours is acceptable due to rounding)
      expect(formatExpirationTime(timestamp2)).toMatch(/expires in (1|2) hours?/);
    });

    it('should format past timestamps with "expired"', () => {
      const now = Date.now();
      const timestamp1 = Timestamp.fromMillis(now - 5 * 60 * 1000); // 5 minutes ago
      const timestamp2 = Timestamp.fromMillis(now - 2 * 60 * 60 * 1000); // 2 hours ago
      
      expect(formatExpirationTime(timestamp1)).toBe('expired 5 minutes ago');
      expect(formatExpirationTime(timestamp2)).toBe('expired 2 hours ago');
    });

    it('should handle timestamps expiring very soon', () => {
      const now = Date.now();
      const timestamp = Timestamp.fromMillis(now + 30 * 1000); // 30 seconds from now
      expect(formatExpirationTime(timestamp)).toBe('expires in less than a minute');
    });

    it('should handle timestamps that just expired', () => {
      const now = Date.now();
      const timestamp = Timestamp.fromMillis(now - 30 * 1000); // 30 seconds ago
      expect(formatExpirationTime(timestamp)).toBe('expired just now');
    });

    it('should format singular units correctly', () => {
      const now = Date.now();
      const timestamp1 = Timestamp.fromMillis(now + 1 * 60 * 1000); // 1 minute from now
      const timestamp2 = Timestamp.fromMillis(now + 1 * 60 * 60 * 1000); // 1 hour from now
      const timestamp3 = Timestamp.fromMillis(now + 1 * 24 * 60 * 60 * 1000); // 1 day from now
      
      expect(formatExpirationTime(timestamp1)).toBe('expires in 1 minute');
      expect(formatExpirationTime(timestamp2)).toBe('expires in 1 hour');
      // Use regex to handle timing variations (23-24 hours could be "1 day" or "23 hours")
      expect(formatExpirationTime(timestamp3)).toMatch(/expires in (1 day|23 hours)/);
    });
  });

  describe('formatAbsoluteTime', () => {
    it('should format timestamp as absolute date and time', () => {
      // January 15, 2025 at 3:45 PM
      const timestamp = Timestamp.fromDate(new Date(2025, 0, 15, 15, 45, 0));
      const formatted = formatAbsoluteTime(timestamp);
      
      // Check that it contains expected components
      expect(formatted).toContain('January');
      expect(formatted).toContain('15');
      expect(formatted).toContain('2025');
      expect(formatted).toContain('3:45');
      expect(formatted).toContain('PM');
    });

    it('should format morning times with AM', () => {
      // January 15, 2025 at 9:30 AM
      const timestamp = Timestamp.fromDate(new Date(2025, 0, 15, 9, 30, 0));
      const formatted = formatAbsoluteTime(timestamp);
      
      expect(formatted).toContain('9:30');
      expect(formatted).toContain('AM');
    });
  });

  describe('formatStatus', () => {
    it('should format "connected" status', () => {
      expect(formatStatus('connected')).toBe('Connected');
    });

    it('should format "error" status', () => {
      expect(formatStatus('error')).toBe('Error');
    });

    it('should format "not_enabled" status', () => {
      expect(formatStatus('not_enabled')).toBe('Not Enabled');
    });

    it('should handle unexpected status values', () => {
      // @ts-expect-error Testing invalid input
      expect(formatStatus('invalid')).toBe('Unknown');
    });
  });

  describe('parseStatus', () => {
    it('should parse "Connected" label', () => {
      expect(parseStatus('Connected')).toBe('connected');
    });

    it('should parse "Error" label', () => {
      expect(parseStatus('Error')).toBe('error');
    });

    it('should parse "Not Enabled" label', () => {
      expect(parseStatus('Not Enabled')).toBe('not_enabled');
    });

    it('should handle unexpected labels', () => {
      expect(parseStatus('Invalid')).toBe('not_enabled');
    });
  });

  describe('formatStatus and parseStatus round-trip', () => {
    it('should satisfy round-trip property for all valid status values', () => {
      const statuses: ServiceStatus[] = ['connected', 'error', 'not_enabled'];
      
      statuses.forEach((status) => {
        const formatted = formatStatus(status);
        const parsed = parseStatus(formatted);
        expect(parsed).toBe(status);
      });
    });
  });

  describe('formatWorkspaceDomain', () => {
    it('should format domain as Google Workspace admin console link', () => {
      const domain = 'example.com';
      const link = formatWorkspaceDomain(domain);
      
      expect(link).toBe('https://admin.google.com/ac/home?hl=en&domain=example.com');
    });

    it('should URL-encode special characters in domain', () => {
      const domain = 'example+test.com';
      const link = formatWorkspaceDomain(domain);
      
      expect(link).toContain(encodeURIComponent(domain));
    });

    it('should handle domains with subdomains', () => {
      const domain = 'school.example.com';
      const link = formatWorkspaceDomain(domain);
      
      expect(link).toBe('https://admin.google.com/ac/home?hl=en&domain=school.example.com');
    });
  });

  describe('formatErrorMessage', () => {
    it('should add period to message without punctuation', () => {
      const message = 'Connection failed';
      expect(formatErrorMessage(message)).toBe('Connection failed.');
    });

    it('should preserve existing period', () => {
      const message = 'Connection failed.';
      expect(formatErrorMessage(message)).toBe('Connection failed.');
    });

    it('should preserve existing exclamation mark', () => {
      const message = 'Connection failed!';
      expect(formatErrorMessage(message)).toBe('Connection failed!');
    });

    it('should preserve existing question mark', () => {
      const message = 'Connection failed?';
      expect(formatErrorMessage(message)).toBe('Connection failed?');
    });

    it('should trim whitespace', () => {
      const message = '  Connection failed  ';
      expect(formatErrorMessage(message)).toBe('Connection failed.');
    });

    it('should handle empty message', () => {
      expect(formatErrorMessage('')).toBe('');
    });

    it('should preserve line breaks', () => {
      const message = 'Connection failed\nPlease try again';
      expect(formatErrorMessage(message)).toBe('Connection failed\nPlease try again.');
    });
  });
});
