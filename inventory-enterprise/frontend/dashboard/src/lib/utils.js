import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with tailwind-merge for proper precedence
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format number with locale
 */
export function formatNumber(num, decimals = 0) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format percentage
 */
export function formatPercent(num, decimals = 1) {
  return `${formatNumber(num, decimals)}%`;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str, length = 50) {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Get status color based on value
 */
export function getStatusColor(status) {
  const colors = {
    active: 'text-green-600 dark:text-green-400',
    inactive: 'text-gray-600 dark:text-gray-400',
    pending: 'text-yellow-600 dark:text-yellow-400',
    error: 'text-red-600 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
  };
  return colors[status.toLowerCase()] || colors.inactive;
}

/**
 * Get badge color based on value
 */
export function getBadgeColor(status) {
  const colors = {
    active: 'badge-success',
    inactive: 'text-gray-800 dark:text-gray-100 bg-gray-100 dark:bg-gray-800',
    pending: 'badge-warning',
    error: 'badge-danger',
    success: 'badge-success',
    warning: 'badge-warning',
  };
  return colors[status.toLowerCase()] || colors.inactive;
}
