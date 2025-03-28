/**
 * Maps ISO 2-digit country codes to their primary timezone
 *
 * @param {string} countryCode - The ISO 2-digit country code (e.g., 'US', 'GB')
 * @return {string} The corresponding timezone identifier (e.g., 'America/New_York')
 */
export const countryToTimezone = (countryCode: string): string => {
  // Mapping of country codes to primary timezones
  const timezoneMap: { [key: string]: string } = {
    'US': 'America/New_York',
    'GB': 'Europe/London',
    'CA': 'America/Toronto',
    'AU': 'Australia/Sydney',
    'NZ': 'Pacific/Auckland',
    'IN': 'Asia/Kolkata',
    'JP': 'Asia/Tokyo',
    'CN': 'Asia/Shanghai',
    'RU': 'Europe/Moscow',
    'DE': 'Europe/Berlin',
    'FR': 'Europe/Paris',
    'ES': 'Europe/Madrid',
    'IT': 'Europe/Rome',
    'BR': 'America/Sao_Paulo',
    'MX': 'America/Mexico_City',
    // Add more countries as needed
  };

  return timezoneMap[countryCode] || 'Europe/London'; // Default to UK time if country not found
};

/**
 * Formats a time (hour and minute) for a specific timezone
 * Returns the cron schedule expression for that time in the given timezone
 *
 * @param {number} hour - The hour (0-23) in 24-hour format
 * @param {number} minute - The minute (0-59)
 * @return {string} A cron schedule expression in the format "minute hour * * *"
 */
export const formatTimeForTimezone = (hour: number, minute: number): string => {
  return `${minute} ${hour} * * *`;
};
