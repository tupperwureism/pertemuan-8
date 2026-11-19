import * as Location from 'expo-location';
import { Linking } from 'react-native';

export type LocationFailure =
  | 'PERMISSION_DENIED'
  | 'PERMISSION_BLOCKED'
  | 'SERVICES_DISABLED'
  | 'UNAVAILABLE'
  | 'TIMEOUT';

const FAILURE_MESSAGES: Record<LocationFailure, string> = {
  PERMISSION_DENIED:
    'Izin lokasi ditolak. Izinkan akses lokasi agar aplikasi dapat memverifikasi posisi Anda.',
  PERMISSION_BLOCKED:
    'Izin lokasi ditolak permanen. Buka pengaturan aplikasi untuk mengaktifkan akses lokasi.',
  SERVICES_DISABLED:
    'Layanan lokasi (GPS) perangkat sedang mati. Aktifkan GPS lalu coba lagi.',
  UNAVAILABLE:
    'Lokasi perangkat belum tersedia. Pastikan sinyal GPS aktif lalu coba lagi.',
  TIMEOUT:
    'Waktu pencarian lokasi habis. Pindah ke area dengan sinyal GPS lebih baik lalu coba lagi.',
};

const FIX_TIMEOUT_MS = 15_000;
const WATCH_TIME_INTERVAL_MS = 5_000;
const WATCH_DISTANCE_INTERVAL_M = 5;

export class LocationError extends Error {
  readonly reason: LocationFailure;

  constructor(reason: LocationFailure, message?: string) {
    super(message ?? FAILURE_MESSAGES[reason]);
    this.name = 'LocationError';
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface DeviceFix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

function toDeviceFix(location: Location.LocationObject): DeviceFix {
  const rawAccuracy = location.coords.accuracy;
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: typeof rawAccuracy === 'number' && Number.isFinite(rawAccuracy) ? rawAccuracy : null,
    timestamp: location.timestamp,
  };
}

async function resolveFailureError(error: unknown): Promise<LocationError> {
  if (error instanceof LocationError) {
    return error;
  }
  const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!servicesEnabled) {
    return new LocationError('SERVICES_DISABLED');
  }
  const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (permission && permission.status !== 'granted') {
    return new LocationError(
      permission.canAskAgain === false ? 'PERMISSION_BLOCKED' : 'PERMISSION_DENIED',
    );
  }
  return new LocationError('UNAVAILABLE');
}

async function ensureForegroundLocationAccess(): Promise<void> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new LocationError('SERVICES_DISABLED');
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new LocationError(
      permission.canAskAgain === false ? 'PERMISSION_BLOCKED' : 'PERMISSION_DENIED',
    );
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new LocationError('TIMEOUT'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Memeriksa GPS, meminta izin foreground bila perlu, lalu mengambil posisi perangkat terkini
 * dengan akurasi tinggi dan batas waktu 15 detik. Melempar `LocationError` (pesan Indonesia).
 */
export async function getCurrentFix(): Promise<DeviceFix> {
  try {
    await ensureForegroundLocationAccess();
    const location = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }),
      FIX_TIMEOUT_MS,
    );
    return toDeviceFix(location);
  } catch (error) {
    throw await resolveFailureError(error);
  }
}

/**
 * Memantau perpindahan posisi perangkat secara real-time.
 * Mengembalikan fungsi berhenti (`unsubscribe`); bila izin/layanan bermasalah, memanggil `onError`.
 */
export async function watchFix(
  onFix: (fix: DeviceFix) => void,
  onError: (error: LocationError) => void,
): Promise<() => void> {
  let stopped = false;

  try {
    await ensureForegroundLocationAccess();
  } catch (error) {
    const locError = await resolveFailureError(error);
    onError(locError);
    return () => undefined;
  }

  try {
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: WATCH_TIME_INTERVAL_MS,
        distanceInterval: WATCH_DISTANCE_INTERVAL_M,
      },
      (location) => {
        if (!stopped) {
          onFix(toDeviceFix(location));
        }
      },
      () => {
        if (stopped) return;
        void resolveFailureError(null).then((locError) => {
          if (!stopped) {
            onError(locError);
          }
        });
      },
    );

    return () => {
      if (stopped) return;
      stopped = true;
      subscription.remove();
    };
  } catch (error) {
    const locError = await resolveFailureError(error);
    onError(locError);
    return () => undefined;
  }
}

/** Membuka halaman pengaturan aplikasi di perangkat (mis. saat izin ditolak permanen). */
export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}
