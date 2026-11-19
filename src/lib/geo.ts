/** Utilitas geometri/geolokasi murni untuk perhitungan jarak lab (tanpa import native). */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Akurasi GPS lebih buruk dari batas ini (dalam meter) ditolak saat presensi berbasis lokasi. */
export const MAX_ACCURACY_METER = 100;

const EARTH_RADIUS_METER = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

/** Menghitung jarak Haversine antara dua titik koordinat dalam satuan meter. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.latitude - a.latitude) * DEG_TO_RAD;
  const dLng = (b.longitude - a.longitude) * DEG_TO_RAD;
  const lat1 = a.latitude * DEG_TO_RAD;
  const lat2 = b.latitude * DEG_TO_RAD;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));

  return EARTH_RADIUS_METER * c;
}

/** Menghitung cosinus garis lintang (radian) untuk estimasi jarak pada Firestore Security Rules. */
export function cosLatitude(latitude: number): number {
  return Math.cos(latitude * DEG_TO_RAD);
}

/** Memeriksa apakah jarak (meter) berada di dalam radius lab yang diizinkan. */
export function isWithinRadius(distanceMeter: number, radiusMeter: number): boolean {
  return distanceMeter <= radiusMeter;
}
