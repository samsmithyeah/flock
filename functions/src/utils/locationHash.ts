// functions/src/utils/locationHash.ts
import { defineString } from 'firebase-functions/params';
import * as crypto from 'crypto';

const LOCATION_PEPPER = defineString('LOCATION_PEPPER').value();

/**
 * Hash a location coordinate using HMAC-SHA256
 * @param {number} coordinate - The latitude or longitude value
 * @return {string} Hashed coordinate string
 */
export const hashCoordinate = (coordinate: number): string => {
  // Convert number to string with fixed precision to ensure consistency
  const coordinateString = coordinate.toFixed(8);
  return crypto.createHmac('sha256', LOCATION_PEPPER).update(coordinateString).digest('hex');
};

/**
 * Hash a complete location object
 * @param {number} latitude - The latitude coordinate
 * @param {number} longitude - The longitude coordinate
 * @return {object} Object with hashed coordinates
 */
export const hashLocation = (latitude: number, longitude: number): { hashedLatitude: string; hashedLongitude: string } => {
  return {
    hashedLatitude: hashCoordinate(latitude),
    hashedLongitude: hashCoordinate(longitude),
  };
};

/**
 * Create a location hash for proximity comparison
 * This creates a composite hash that can be used for approximate location matching
 * while preserving privacy
 * @param {number} latitude - The latitude coordinate
 * @param {number} longitude - The longitude coordinate
 * @return {string} Single hash representing the location area
 */
export const createLocationAreaHash = (latitude: number, longitude: number): string => {
  // Round coordinates to reduce precision for area-based matching
  // This creates ~100m precision zones for privacy while allowing proximity detection
  const roundedLat = Math.round(latitude * 1000) / 1000; // ~111m precision
  const roundedLng = Math.round(longitude * 1000) / 1000; // ~111m precision at equator

  const locationString = `${roundedLat.toFixed(3)},${roundedLng.toFixed(3)}`;
  return crypto.createHmac('sha256', LOCATION_PEPPER).update(locationString).digest('hex');
};

/**
 * Calculate distance between two hashed locations using their original precision
 * Note: This requires the original coordinates for calculation, as hashed values
 * cannot be used for distance calculations. In practice, you'd store both
 * hashed coordinates (for privacy) and use the original coordinates only
 * server-side for proximity calculations.
 * @param {number} lat1 - First latitude
 * @param {number} lng1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lng2 - Second longitude
 * @return {number} Distance in meters
 */
export const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};
