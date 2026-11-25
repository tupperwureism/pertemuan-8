import { useCallback, useEffect, useState } from 'react';

import {
  getCurrentFix,
  LocationError,
  openAppSettings,
  watchFix,
  type DeviceFix,
} from '@/services/locationService';

export type DeviceLocationStatus = 'idle' | 'requesting' | 'ready' | 'error';

export interface UseDeviceLocationResult {
  fix: DeviceFix | null;
  status: DeviceLocationStatus;
  error: LocationError | null;
  refresh: () => void;
  openSettings: () => void;
}

/**
 * Mengambil posisi perangkat saat mount; bila `watch: true`, melanjutkan pemantauan real-time
 * dan membersihkan langganan otomatis saat komponen unmount.
 * Bila posisi sebelumnya sudah tersedia dan pembaruan berikutnya gagal sesaat, `fix` terakhir
 * tetap dipertahankan sementara `status` menjadi `'error'` dan `error` terisi.
 */
export function useDeviceLocation(opts?: { watch?: boolean }): UseDeviceLocationResult {
  const watch = opts?.watch ?? false;

  const [fix, setFix] = useState<DeviceFix | null>(null);
  const [status, setStatus] = useState<DeviceLocationStatus>('requesting');
  const [error, setError] = useState<LocationError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stopWatch: (() => void) | null = null;

    const run = async () => {
      try {
        const initialFix = await getCurrentFix();
        if (cancelled) return;
        setFix(initialFix);
        setError(null);
        setStatus('ready');

        if (!watch) return;

        const stop = await watchFix(
          (nextFix) => {
            if (cancelled) return;
            setFix(nextFix);
            setError(null);
            setStatus('ready');
          },
          (watchError) => {
            if (cancelled) return;
            setError(watchError);
            setStatus('error');
          },
        );

        if (cancelled) {
          stop();
        } else {
          stopWatch = stop;
        }
      } catch (err) {
        if (cancelled) return;
        const locError =
          err instanceof LocationError ? err : new LocationError('UNAVAILABLE');
        setError(locError);
        setStatus('error');
      }
    };

    void run();

    return () => {
      cancelled = true;
      stopWatch?.();
      stopWatch = null;
    };
  }, [watch, attempt]);

  const refresh = useCallback(() => {
    setError(null);
    setStatus('requesting');
    setAttempt((n) => n + 1);
  }, []);

  const openSettings = useCallback(() => {
    void openAppSettings();
  }, []);

  return {
    fix,
    status,
    error,
    refresh,
    openSettings,
  };
}
