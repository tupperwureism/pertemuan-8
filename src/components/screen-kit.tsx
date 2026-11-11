/**
 * Komponen kecil bersama untuk layar Sprint 2 (login, register, admin asisten, state kosong/error).
 * Token warna dan bentuk mengikuti UI Sprint 1: slate netral, biru = praktikan, ungu = asisten.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

export const colors = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  inputBorder: '#CBD5E1',
  text: '#0F172A',
  textMuted: '#64748B',
  label: '#334155',
  praktikan: '#2563EB',
  asisten: '#7C3AED',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  dangerBorder: '#FCA5A5',
  dangerText: '#B91C1C',
  success: '#16A34A',
} as const;

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.headerBack}>
        <Text style={styles.headerBackText}>Kembali</Text>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

export function FormField({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#94A3B8"
        {...input}
        style={[styles.textInput, error ? styles.textInputError : null, input.style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  tone = 'praktikan',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'praktikan' | 'asisten' | 'danger' | 'neutral';
}) {
  const bg = tone === 'neutral' ? '#E2E8F0' : tone === 'danger' ? colors.danger : colors[tone];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        pressed && styles.buttonPressed,
        inactive && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'neutral' ? colors.text : '#FFFFFF'} />
      ) : (
        <Text style={[styles.buttonText, tone === 'neutral' && { color: colors.label }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" style={styles.errorBox}>
      <Text style={styles.errorText}>⚠️ {message}</Text>
    </View>
  );
}

export function LoadingState({ label = 'Memuat data…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.praktikan} />
      <Text style={styles.stateSubtitle}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon = '📭',
  title,
  subtitle,
  action,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.stateIcon}>{icon}</Text>
      <Text style={styles.stateTitle}>{title}</Text>
      {subtitle ? <Text style={styles.stateSubtitle}>{subtitle}</Text> : null}
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.stateIcon}>⚠️</Text>
      <Text style={styles.stateTitle}>Data tidak dapat dimuat</Text>
      <Text style={styles.stateSubtitle}>{message}</Text>
      {onRetry ? <PrimaryButton label="Coba lagi" onPress={onRetry} tone="neutral" /> : null}
    </View>
  );
}

/** Bottom sheet konfirmasi (gaya modal Sprint 1) untuk tindakan destruktif/penting. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  loading,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'danger' | 'asisten' | 'praktikan';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Tutup dialog" style={styles.backdrop} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetMessage}>{message}</Text>
          <View style={styles.sheetActions}>
            <View style={styles.flex1}>
              <PrimaryButton label="Batal" tone="neutral" onPress={onCancel} disabled={loading} />
            </View>
            <View style={styles.flex1}>
              <PrimaryButton label={confirmLabel} tone={tone} onPress={onConfirm} loading={loading} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Sheet berisi form (tambah/ubah) dengan judul. */
export function FormSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Tutup form" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, styles.formSheet]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  headerBack: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F1F5F9' },
  headerBackText: { fontSize: 12, fontWeight: '700', color: colors.label },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' },
  headerRight: { minWidth: 64, alignItems: 'flex-end' },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.label },
  textInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  textInputError: { borderColor: colors.danger },
  fieldError: { fontSize: 12, color: colors.dangerText, fontWeight: '600' },
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 8,
    padding: 10,
  },
  errorText: { color: colors.dangerText, fontSize: 12, fontWeight: '600' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateIcon: { fontSize: 40 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: colors.label, textAlign: 'center' },
  stateSubtitle: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.55)' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    gap: 14,
  },
  formSheet: { maxHeight: '90%' },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.inputBorder,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  sheetMessage: { fontSize: 14, color: colors.label, lineHeight: 21 },
  sheetActions: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
});
