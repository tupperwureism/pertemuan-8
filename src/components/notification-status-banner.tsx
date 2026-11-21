import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PushRegistrationStatus } from '@/hooks/use-push-registration';

export function NotificationStatusBanner({
  status,
  message,
  retry,
  openSettings,
}: {
  status: PushRegistrationStatus;
  message: string;
  retry: () => void;
  openSettings: () => void;
}) {
  if (status === 'registered' || status === 'checking') return null;

  const canOpenSettings = status === 'denied' || status === 'blocked';
  const canRetry = status !== 'unsupported';

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <View style={styles.copy}>
        <Text style={styles.title}>Notifikasi belum aktif</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      <View style={styles.actions}>
        {canOpenSettings ? (
          <Pressable accessibilityRole="button" onPress={openSettings} style={styles.action}>
            <Text style={styles.actionText}>Pengaturan</Text>
          </Pressable>
        ) : null}
        {canRetry ? (
          <Pressable accessibilityRole="button" onPress={retry} style={styles.action}>
            <Text style={styles.actionText}>Coba lagi</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copy: { flex: 1, gap: 2 },
  title: { color: '#92400E', fontSize: 12, fontWeight: '800' },
  message: { color: '#A16207', fontSize: 11, lineHeight: 16 },
  actions: { gap: 6, alignItems: 'stretch' },
  action: { backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  actionText: { color: '#92400E', fontSize: 10, fontWeight: '800' },
});
