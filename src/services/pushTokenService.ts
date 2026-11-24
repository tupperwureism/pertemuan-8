import { deleteDoc, doc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { firestore, requireUid } from '@/services/firebase';
import { COLLECTIONS } from '@/types/firebase';

export type PushRegistrationFailure =
  | 'UNSUPPORTED_DEVICE'
  | 'DENIED'
  | 'BLOCKED'
  | 'NO_TOKEN'
  | 'ERROR';

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: PushRegistrationFailure; message: string };

let cachedRegistration: { uid: string; result: PushRegistrationResult } | null = null;
let inFlightRegistration: { uid: string; promise: Promise<PushRegistrationResult> } | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function routeFromNotification(notification: Notifications.Notification): void {
  const data = notification.request.content.data ?? {};
  const type = typeof data.type === 'string' ? data.type : '';
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';

  if (type === 'SESSION_OPENED' && sessionId) {
    router.push(`/praktikan/presensi/${sessionId}` as Href);
    return;
  }
  if (type === 'SESSION_RESCHEDULED' && sessionId) {
    router.push(`/praktikan/${sessionId}` as Href);
    return;
  }
  if (type === 'PERMISSION_DECIDED') {
    router.push('/praktikan/izin' as Href);
  }
}

/** Memasang listener ketukan push dan menangani push yang membuka aplikasi dari keadaan tertutup. */
export function subscribeNotificationNavigation(): () => void {
  const lastResponse = Notifications.getLastNotificationResponse();
  if (lastResponse?.notification) {
    routeFromNotification(lastResponse.notification);
    Notifications.clearLastNotificationResponse();
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    routeFromNotification(response.notification);
  });
  return () => subscription.remove();
}

async function performRegistration(uid: string): Promise<PushRegistrationResult> {
  if (!Device.isDevice || (Platform.OS !== 'android' && Platform.OS !== 'ios')) {
    return {
      ok: false,
      reason: 'UNSUPPORTED_DEVICE',
      message: 'Perangkat ini tidak mendukung pendaftaran push notification.',
    };
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Pemberitahuan praktikum',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
        sound: 'default',
      });
    }

    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) {
      const blocked = permission.canAskAgain === false;
      return {
        ok: false,
        reason: blocked ? 'BLOCKED' : 'DENIED',
        message: blocked
          ? 'Notifikasi dinonaktifkan permanen. Buka pengaturan aplikasi untuk mengaktifkannya.'
          : 'Notifikasi dinonaktifkan. Anda tidak akan menerima info sesi atau izin.',
      };
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (typeof projectId !== 'string' || !projectId.trim()) {
      return {
        ok: false,
        reason: 'NO_TOKEN',
        message: 'Konfigurasi project Expo belum tersedia. Hubungi pengelola aplikasi.',
      };
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) {
      return {
        ok: false,
        reason: 'NO_TOKEN',
        message: 'Token notifikasi belum tersedia. Silakan coba lagi.',
      };
    }

    await setDoc(doc(firestore(), COLLECTIONS.pushTokens, uid), {
      uid,
      token,
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
    });

    return { ok: true, token };
  } catch {
    return {
      ok: false,
      reason: 'ERROR',
      message: 'Pendaftaran notifikasi gagal. Periksa koneksi internet lalu coba lagi.',
    };
  }
}

/** Meminta izin, mengambil Expo Push Token, lalu menyimpan token milik pengguna yang login. */
export async function registerPushToken(): Promise<PushRegistrationResult> {
  let uid: string;
  try {
    uid = requireUid();
  } catch {
    return { ok: false, reason: 'ERROR', message: 'Sesi login tidak ditemukan.' };
  }

  if (cachedRegistration?.uid === uid) return cachedRegistration.result;
  if (inFlightRegistration?.uid === uid) return inFlightRegistration.promise;

  const promise = performRegistration(uid).then((result) => {
    cachedRegistration = { uid, result };
    if (inFlightRegistration?.uid === uid) inFlightRegistration = null;
    return result;
  });
  inFlightRegistration = { uid, promise };
  return promise;
}

/** Memungkinkan tombol coba lagi mengulang permintaan/token pada sesi login yang sama. */
export function resetPushRegistrationAttempt(): void {
  cachedRegistration = null;
  inFlightRegistration = null;
}

/** Menghapus token perangkat saat logout. Kegagalan sengaja tidak menghalangi proses keluar. */
export async function removePushToken(): Promise<void> {
  try {
    const uid = requireUid();
    await deleteDoc(doc(firestore(), COLLECTIONS.pushTokens, uid));
  } catch {
    // Logout harus tetap dapat dilanjutkan walaupun token gagal dihapus.
  } finally {
    cachedRegistration = null;
    inFlightRegistration = null;
  }
}
