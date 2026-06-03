/**
 * Status Formatting Utilities for Google Workspace Integration
 * 
 * This module provides formatting functions for the Integration Settings UI.
 * It handles:
 * - Relative time formatting for timestamps (lastVerifiedAt, lastRefreshedAt)
 * - Status code to human-readable label conversion
 * - Workspace domain formatting with clickable links
 * - Error message formatting with proper line breaks
 * 
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Service status type
 */
export type ServiceStatus = 'connected' | 'error' | 'not_enabled';

/**
 * Format a Firestore Timestamp as a relative time string
 * 
 * Examples:
 * - "just now" (< 1 minute)
 * - "2 minutes ago"
 * - "3 hours ago"
 * - "2 days ago"
 * - "1 month ago"
 * - "1 year ago"
 * 
 * Requirement: 17.1, 17.2
 * 
 * @param timestamp - Firestore Timestamp to format
 * @returns Human-readable relative time string
 */
export function formatRelativeTime(timestamp: Timestamp): string {
  const now = Date.now();
  const then = timestamp.toMillis();
  const diffMs = now - then;
  
  // Handle future timestamps (should not happen, but be defensive)
  if (diffMs < 0) {
    return 'just now';
  }
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (seconds < 60) {
    return 'just now';
  } else if (minutes < 60) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  } else if (hours < 24) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  } else if (days < 30) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  } else if (months < 12) {
    return months === 1 ? '1 month ago' : `${months} months ago`;
  } else {
    return years === 1 ? '1 year ago' : `${years} years ago`;
  }
}

/**
 * Format a Firestore Timestamp as a relative time string for future times
 * 
 * Examples:
 * - "expires in 45 minutes"
 * - "expires in 2 hours"
 * - "expired 5 minutes ago"
 * 
 * Requirement: 17.2
 * 
 * @param timestamp - Firestore Timestamp to format
 * @returns Human-readable relative time string with "expires in" or "expired"
 */
export function formatExpirationTime(timestamp: Timestamp): string {
  const now = Date.now();
  const then = timestamp.toMillis();
  const diffMs = then - now;
  
  // Already expired
  if (diffMs < 0) {
    const expiredMs = Math.abs(diffMs);
    const seconds = Math.floor(expiredMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 60) {
      return 'expired just now';
    } else if (minutes < 60) {
      return minutes === 1 ? 'expired 1 minute ago' : `expired ${minutes} minutes ago`;
    } else {
      return hours === 1 ? 'expired 1 hour ago' : `expired ${hours} hours ago`;
    }
  }
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) {
    return 'expires in less than a minute';
  } else if (minutes < 60) {
    return minutes === 1 ? 'expires in 1 minute' : `expires in ${minutes} minutes`;
  } else if (hours < 24) {
    return hours === 1 ? 'expires in 1 hour' : `expires in ${hours} hours`;
  } else {
    return days === 1 ? 'expires in 1 day' : `expires in ${days} days`;
  }
}

/**
 * Format a Firestore Timestamp as an absolute date and time string
 * 
 * Example: "January 15, 2025 at 3:45 PM"
 * 
 * Requirement: 17.3
 * 
 * @param timestamp - Firestore Timestamp to format
 * @returns Human-readable absolute date and time string
 */
export function formatAbsoluteTime(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Convert a service status code to a human-readable label
 * 
 * Mapping:
 * - 'connected' -> 'Connected'
 * - 'error' -> 'Error'
 * - 'not_enabled' -> 'Not Enabled'
 * 
 * Requirement: 17.4
 * 
 * @param status - Service status code
 * @returns Human-readable status label
 */
export function formatStatus(status: ServiceStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'error':
      return 'Error';
    case 'not_enabled':
      return 'Not Enabled';
    default:
      // Defensive: handle unexpected status values
      return 'Unknown';
  }
}

/**
 * Convert a human-readable status label back to a status code
 * 
 * Mapping:
 * - 'Connected' -> 'connected'
 * - 'Error' -> 'error'
 * - 'Not Enabled' -> 'not_enabled'
 * 
 * This function satisfies the round-trip property:
 * parseStatus(formatStatus(status)) === status
 * 
 * Requirement: 17.4, 17.7
 * 
 * @param label - Human-readable status label
 * @returns Service status code
 */
export function parseStatus(label: string): ServiceStatus {
  switch (label) {
    case 'Connected':
      return 'connected';
    case 'Error':
      return 'error';
    case 'Not Enabled':
      return 'not_enabled';
    default:
      // Defensive: default to 'not_enabled' for unknown labels
      return 'not_enabled';
  }
}

/**
 * Format a workspace domain as a clickable link to Google Workspace admin console
 * 
 * Example: "example.com" -> "https://admin.google.com/ac/home?hl=en&domain=example.com"
 * 
 * Requirement: 17.5
 * 
 * @param domain - Workspace domain (e.g., "example.com")
 * @returns URL to Google Workspace admin console for the domain
 */
export function formatWorkspaceDomain(domain: string): string {
  return `https://admin.google.com/ac/home?hl=en&domain=${encodeURIComponent(domain)}`;
}

/**
 * Format an error message with proper line breaks and punctuation
 * 
 * This function:
 * - Ensures the message ends with proper punctuation (. ! ?)
 * - Preserves existing line breaks
 * - Trims whitespace
 * 
 * Requirement: 17.6
 * 
 * @param message - Raw error message
 * @returns Formatted error message with proper punctuation
 */
export function formatErrorMessage(message: string): string {
  if (!message) {
    return '';
  }
  
  // Trim whitespace
  let formatted = message.trim();
  
  // Ensure message ends with punctuation
  const lastChar = formatted[formatted.length - 1];
  if (lastChar !== '.' && lastChar !== '!' && lastChar !== '?') {
    formatted += '.';
  }
  
  return formatted;
}
