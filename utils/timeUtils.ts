/**
 * Time utility functions for consistent timestamp handling
 */

/**
 * Converts various timestamp formats to a Date object
 * Handles Firebase Timestamps, Date objects, and timestamp strings/numbers
 */
export const normalizeTimestamp = (timestamp: any): Date | null => {
  if (!timestamp) return null;

  try {
    // Firebase Timestamp with toDate method
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }

    // Firebase Timestamp object format
    if (timestamp._seconds || timestamp.seconds) {
      const seconds = timestamp._seconds || timestamp.seconds;
      return new Date(seconds * 1000);
    }

    // Already a Date object
    if (timestamp instanceof Date) {
      return timestamp;
    }

    // String or number timestamp
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      console.warn('Invalid timestamp provided:', timestamp);
      return null;
    }

    return date;
  } catch (error) {
    console.error('Error normalizing timestamp:', error);
    return null;
  }
};

/**
 * Calculates time remaining until expiry
 * Returns a human-readable string
 */
export const getTimeRemaining = (expiresAt: any): string => {
  const expiry = normalizeTimestamp(expiresAt);

  if (!expiry) return 'No expiration';

  const now = new Date();
  const diff = expiry.getTime() - now.getTime();

  if (diff <= 0) return 'Expired';

  const totalMinutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  } else if (minutes > 0) {
    return `${minutes}m remaining`;
  } else {
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${seconds}s remaining`;
  }
};

/**
 * Calculates time elapsed since a timestamp
 * Returns a human-readable string
 */
export const getTimeAgo = (timestamp: any): string => {
  const date = normalizeTimestamp(timestamp);

  if (!date) return 'Unknown time';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};
