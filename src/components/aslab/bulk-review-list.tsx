import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, PrimaryButton } from '@/components/screen-kit';
import {
  createEmptyCsvRow,
  CSV_COLUMNS,
  validateCsvRow,
  type CsvReviewRow,
  type CsvTemplateType,
} from '@/lib/csv';

const COLUMN_LABELS: Record<string, string> = {
  nama: 'Nama',
  gedung: 'Gedung',
  deskripsi: 'Deskripsi (opsional)',
  latitude: 'Latitude',
  longitude: 'Longitude',
  radiusMeter: 'Radius (m)',
  gracePeriodMinutes: 'Toleransi (mnt)',
  fineAmount: 'Denda (Rp)',
  email: 'Email',
  nim: 'NIM',
  kode: 'Kode Asprak',
};

const NUMERIC_COLUMNS = new Set([
  'latitude',
  'longitude',
  'radiusMeter',
  'gracePeriodMinutes',
  'fineAmount',
]);

/**
 * Daftar preview interaktif hasil parse bulk CSV di dalam ScrollView.
 * Aslab dapat Accept/Deny tiap baris, mengedit inline, mengisi kolom kosong, lalu menyimpan.
 */
export function BulkReviewList({
  type,
  rows,
  saving,
  submitLabelPrefix = 'Simpan',
  onChangeRows,
  onSubmit,
}: {
  type: CsvTemplateType;
  rows: CsvReviewRow[];
  saving?: boolean;
  submitLabelPrefix?: string;
  onChangeRows: (next: CsvReviewRow[]) => void;
  onSubmit: (acceptedRows: CsvReviewRow[]) => void;
}) {
  const columns = CSV_COLUMNS[type];
  const acceptedRows = rows.filter((r) => r.accepted);
  const deniedCount = rows.length - acceptedRows.length;
  const invalidAcceptedCount = acceptedRows.filter(
    (r) => Object.keys(r.errors).length > 0,
  ).length;

  const toggleAccepted = (id: string) => {
    onChangeRows(
      rows.map((r) => (r.id === id ? { ...r, accepted: !r.accepted } : r)),
    );
  };

  const updateField = (id: string, col: string, value: string) => {
    onChangeRows(
      rows.map((r) => {
        if (r.id !== id) return r;
        const nextValues = { ...r.values, [col]: value };
        return {
          ...r,
          values: nextValues,
          errors: validateCsvRow(type, nextValues),
        };
      }),
    );
  };

  const addEmptyRow = () => {
    onChangeRows([...rows, createEmptyCsvRow(type, rows.length)]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {acceptedRows.length} disetujui · {deniedCount} ditolak · {invalidAcceptedCount} perlu dilengkapi
        </Text>
        <Pressable accessibilityRole="button" onPress={addEmptyRow} style={styles.addRowButton}>
          <Text style={styles.addRowText}>+ Tambah Baris</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollArea}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {rows.map((row, idx) => {
          const errEntries = Object.entries(row.errors);
          const isValid = errEntries.length === 0;
          return (
            <View
              key={row.id}
              style={[
                styles.rowCard,
                !row.accepted && styles.rowCardDenied,
                row.accepted && !isValid && styles.rowCardInvalid,
              ]}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>
                  Baris #{idx + 1} · {row.accepted ? (isValid ? 'Siap Simpan' : 'Perlu Dilengkapi') : 'Ditolak (Diabaikan)'}
                </Text>
                <View style={styles.decisionGroup}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (!row.accepted) toggleAccepted(row.id);
                    }}
                    style={[
                      styles.decisionPill,
                      row.accepted ? styles.acceptActive : styles.decisionInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.decisionText,
                        row.accepted && styles.decisionTextActive,
                      ]}
                    >
                      Accept
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (row.accepted) toggleAccepted(row.id);
                    }}
                    style={[
                      styles.decisionPill,
                      !row.accepted ? styles.denyActive : styles.decisionInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.decisionText,
                        !row.accepted && styles.decisionTextActive,
                      ]}
                    >
                      Deny
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.fieldsGrid}>
                {columns.map((col) => {
                  const fieldErr = row.errors[col];
                  const val = row.values[col] ?? '';
                  return (
                    <View key={col} style={styles.fieldItem}>
                      <Text style={styles.fieldLabel}>{COLUMN_LABELS[col] ?? col}</Text>
                      <TextInput
                        value={val}
                        onChangeText={(text) => updateField(row.id, col, text)}
                        placeholder={`Isi ${COLUMN_LABELS[col] ?? col}`}
                        placeholderTextColor="#94A3B8"
                        autoCapitalize={col === 'email' ? 'none' : col === 'kode' ? 'characters' : 'sentences'}
                        keyboardType={NUMERIC_COLUMNS.has(col) ? 'numbers-and-punctuation' : 'default'}
                        style={[
                          styles.input,
                          row.accepted && fieldErr ? styles.inputError : null,
                        ]}
                      />
                      {row.accepted && fieldErr ? (
                        <Text style={styles.fieldError}>{fieldErr}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <PrimaryButton
        label={`${submitLabelPrefix} ${acceptedRows.length} Baris Disetujui`}
        tone="asisten"
        loading={saving}
        disabled={acceptedRows.length === 0 || invalidAcceptedCount > 0}
        onPress={() => onSubmit(acceptedRows)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summaryText: { fontSize: 12, fontWeight: '700', color: colors.label },
  addRowButton: {
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addRowText: { fontSize: 12, fontWeight: '700', color: '#6D28D9' },
  scrollArea: { maxHeight: 360 },
  scrollContent: { gap: 10, paddingBottom: 4 },
  rowCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  rowCardDenied: {
    opacity: 0.55,
    backgroundColor: '#F8FAFC',
  },
  rowCardInvalid: {
    borderColor: colors.dangerBorder,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowTitle: { fontSize: 12, fontWeight: '800', color: colors.text },
  decisionGroup: { flexDirection: 'row', gap: 6 },
  decisionPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  decisionInactive: { backgroundColor: '#E2E8F0' },
  acceptActive: { backgroundColor: colors.success },
  denyActive: { backgroundColor: colors.danger },
  decisionText: { fontSize: 11, fontWeight: '700', color: colors.label },
  decisionTextActive: { color: '#FFFFFF' },
  fieldsGrid: { gap: 8 },
  fieldItem: { gap: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  fieldError: { fontSize: 11, color: colors.dangerText, fontWeight: '600' },
});
