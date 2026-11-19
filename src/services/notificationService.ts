import { collection, doc, getDoc, getDocs, query, where } from '@react-native-firebase/firestore';

import {
  COLLECTIONS,
  type ClassMemberDoc,
  type PermissionDoc,
  type PushTokenDoc,
  type SessionDoc,
} from '@/types/firebase';

import { firestore, withId } from './firebase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_BATCH_SIZE = 100;

type PushNotificationType = 'SESSION_OPENED' | 'SESSION_RESCHEDULED' | 'PERMISSION_DECIDED';

interface PushPayloadData {
  type: PushNotificationType;
  sessionId: string;
  permissionId?: string;
}

interface ExpoPushTicket {
  status?: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket[];
}

async function getClassPraktikanUids(classId: string): Promise<string[]> {
  try {
    const snap = await getDocs(
      query(collection(firestore(), COLLECTIONS.classMembers), where('classId', '==', classId)),
    );
    return snap.docs
      .map((d) => d.data() as Omit<ClassMemberDoc, 'id'>)
      .filter((m) => m.role === 'praktikan' && Boolean(m.uid))
      .map((m) => m.uid);
  } catch (error) {
    console.warn('[notificationService] Gagal membaca anggota kelas:', error);
    return [];
  }
}

async function fetchPushTokens(uids: string[]): Promise<string[]> {
  const uniqueUids = [...new Set(uids.map((u) => u.trim()).filter(Boolean))];
  if (uniqueUids.length === 0) return [];

  const docs = await Promise.all(
    uniqueUids.map(async (uid) => {
      try {
        const snap = await getDoc(doc(firestore(), COLLECTIONS.pushTokens, uid));
        return withId<PushTokenDoc>(snap);
      } catch {
        return null;
      }
    }),
  );

  return [
    ...new Set(
      docs
        .map((d) => d?.token?.trim() ?? '')
        .filter((token) => token.length > 0),
    ),
  ];
}

async function sendPush(
  uids: string[],
  payload: { title: string; body: string; data: PushPayloadData },
): Promise<void> {
  try {
    const tokens = await fetchPushTokens(uids);
    if (tokens.length === 0) return;

    for (let i = 0; i < tokens.length; i += EXPO_PUSH_BATCH_SIZE) {
      const batch = tokens.slice(i, i + EXPO_PUSH_BATCH_SIZE);
      const messages = batch.map((to) => ({
        to,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: 'default',
        channelId: 'default',
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        console.warn(`[notificationService] Expo Push HTTP ${res.status}: ${res.statusText}`);
        continue;
      }

      const json = (await res.json().catch(() => null)) as ExpoPushResponse | null;
      const tickets = Array.isArray(json?.data) ? json.data : [];
      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'error') {
          console.warn(
            `[notificationService] Push ticket gagal (${batch[idx] ?? idx}):`,
            ticket.message ?? ticket.details?.error ?? 'unknown error',
          );
        }
      });
    }
  } catch (error) {
    console.warn('[notificationService] Gagal mengirim push notification:', error);
  }
}

/** Mengirim push ke praktikan anggota kelas saat sesi praktikum dibuka. Tidak pernah melempar error. */
export async function notifySessionOpened(session: SessionDoc): Promise<void> {
  try {
    const uids = await getClassPraktikanUids(session.classId);
    await sendPush(uids, {
      title: 'Sesi Praktikum Dibuka',
      body: `Sesi dibuka: ${session.judul} - presensi sekarang tersedia di ${session.ruangan}.`,
      data: {
        type: 'SESSION_OPENED',
        sessionId: session.id,
      },
    });
  } catch (error) {
    console.warn('[notificationService] notifySessionOpened gagal:', error);
  }
}

/** Mengirim push ke praktikan anggota kelas saat waktu/ruangan sesi berubah. Tidak pernah melempar error. */
export async function notifySessionRescheduled(
  session: SessionDoc,
  changes: string[],
): Promise<void> {
  try {
    const uids = await getClassPraktikanUids(session.classId);
    const changeSummary = changes.length > 0 ? changes.join(' dan ') : 'jadwal';
    await sendPush(uids, {
      title: 'Perubahan Jadwal Praktikum',
      body: `Perubahan ${changeSummary} pada sesi ${session.judul}. Lokasi: ${session.ruangan}.`,
      data: {
        type: 'SESSION_RESCHEDULED',
        sessionId: session.id,
      },
    });
  } catch (error) {
    console.warn('[notificationService] notifySessionRescheduled gagal:', error);
  }
}

/** Mengirim push ke praktikan pengaju izin saat asisten menyetujui atau menolak izin. Tidak pernah melempar error. */
export async function notifyPermissionDecided(
  permission: PermissionDoc,
  decision: 'APPROVED' | 'REJECTED',
): Promise<void> {
  try {
    await sendPush([permission.praktikanUid], {
      title: decision === 'APPROVED' ? 'Pengajuan Izin Diterima' : 'Pengajuan Izin Ditolak',
      body:
        decision === 'APPROVED'
          ? 'Izin Anda diterima oleh asisten.'
          : 'Izin Anda ditolak oleh asisten.',
      data: {
        type: 'PERMISSION_DECIDED',
        sessionId: permission.sessionId,
        permissionId: permission.id,
      },
    });
  } catch (error) {
    console.warn('[notificationService] notifyPermissionDecided gagal:', error);
  }
}
