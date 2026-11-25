import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BulkReviewList } from '@/components/aslab/bulk-review-list';
import {
  colors,
  EmptyState,
  ErrorBanner,
  ErrorState,
  FormField,
  LoadingState,
  PrimaryButton,
  ScreenHeader,
} from '@/components/screen-kit';
import { useSubscription } from '@/hooks/use-subscription';
import {
  downloadOrShareCsvTemplate,
  getCsvDemoSample,
  parseCsvRows,
  type CsvReviewRow,
} from '@/lib/csv';
import {
  assignUsersToLab,
  moveMemberBetweenLabs,
  subscribeAllLabs,
  subscribeAllUsers,
  subscribeLabMembers,
  type BulkOperationSummary,
} from '@/services/aslabService';
import { getErrorMessage } from '@/services/authService';
import type { UserRole } from '@/types/firebase';

type Tab = 'praktikan' | 'asprak' | 'pindah';
type InsertMode = 'single' | 'bulk';
type MoveRoleFilter = 'praktikan' | 'staff';

/** Distribusi anggota lab (SRS-32): Insert Praktikan (terpisah), Insert Asprak (terpisah), & Pindah Lab. */
export default function AslabDistributionScreen() {
  const subLabs = useCallback(
    (cb: Parameters<typeof subscribeAllLabs>[0], err: Parameters<typeof subscribeAllLabs>[1]) =>
      subscribeAllLabs(cb, err),
    [],
  );
  const subUsers = useCallback(
    (cb: Parameters<typeof subscribeAllUsers>[0], err: Parameters<typeof subscribeAllUsers>[1]) =>
      subscribeAllUsers(cb, err),
    [],
  );
  const subMembers = useCallback(
    (
      cb: Parameters<typeof subscribeLabMembers>[1],
      err: Parameters<typeof subscribeLabMembers>[2],
    ) => subscribeLabMembers(null, cb, err),
    [],
  );

  const { data: labs, loading: labsLoading, error: labsError, retry: retryLabs } = useSubscription(subLabs);
  const { data: users } = useSubscription(subUsers);
  const { data: members } = useSubscription(subMembers);

  const [activeTab, setActiveTab] = useState<Tab>('praktikan');
  const [insertMode, setInsertMode] = useState<InsertMode>('single');
  const [selectedLabId, setSelectedLabId] = useState<string>('');

  // Single insert state
  const [singleIdentifier, setSingleIdentifier] = useState('');

  // Bulk insert state (terpisah antara praktikan & asprak)
  const [csvTextPraktikan, setCsvTextPraktikan] = useState('');
  const [rowsPraktikan, setRowsPraktikan] = useState<CsvReviewRow[]>([]);
  const [csvTextAsprak, setCsvTextAsprak] = useState('');
  const [rowsAsprak, setRowsAsprak] = useState<CsvReviewRow[]>([]);

  // Pindah lab state
  const [moveRole, setMoveRole] = useState<MoveRoleFilter>('praktikan');
  const [fromLabId, setFromLabId] = useState('');
  const [toLabId, setToLabId] = useState('');
  const [selectedMemberUid, setSelectedMemberUid] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');
  const [summary, setSummary] = useState<BulkOperationSummary | null>(null);

  const labList = labs ?? [];
  const activeLabId = labList.some((l) => l.id === selectedLabId)
    ? selectedLabId
    : labList[0]?.id ?? '';
  const activeFromLabId = labList.some((l) => l.id === fromLabId)
    ? fromLabId
    : labList[0]?.id ?? '';
  const activeToLabId =
    toLabId !== activeFromLabId && labList.some((l) => l.id === toLabId) ? toLabId : '';

  const targetRole: 'praktikan' | 'asisten' = activeTab === 'asprak' ? 'asisten' : 'praktikan';
  const csvType = activeTab === 'asprak' ? 'asprak' : 'praktikan';
  const csvText = activeTab === 'asprak' ? csvTextAsprak : csvTextPraktikan;
  const setCsvText = activeTab === 'asprak' ? setCsvTextAsprak : setCsvTextPraktikan;
  const reviewRows = activeTab === 'asprak' ? rowsAsprak : rowsPraktikan;
  const setReviewRows = activeTab === 'asprak' ? setRowsAsprak : setRowsPraktikan;

  const candidateUsers = useMemo(
    () => (users ?? []).filter((u) => u.role === targetRole),
    [users, targetRole],
  );

  const labMembersForMove = useMemo(() => {
    const allowed: UserRole[] = moveRole === 'praktikan' ? ['praktikan'] : ['asisten', 'aslab'];
    return (members ?? []).filter(
      (m) => m.labId === activeFromLabId && allowed.includes(m.role),
    );
  }, [members, activeFromLabId, moveRole]);

  const currentLabMembers = useMemo(
    () => (members ?? []).filter((m) => m.labId === activeLabId && m.role === targetRole),
    [members, activeLabId, targetRole],
  );

  const clearFeedback = () => {
    setErrorMsg('');
    setNoticeMsg('');
    setSummary(null);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    clearFeedback();
  };

  const handleSingleAssign = async (identifierOverride?: string) => {
    const raw = (identifierOverride ?? singleIdentifier).trim();
    if (!activeLabId) {
      setErrorMsg('Pilih laboratorium tujuan terlebih dahulu.');
      return;
    }
    if (!raw) {
      setErrorMsg('Masukkan email atau NIM/kode pengguna.');
      return;
    }

    setSaving(true);
    clearFeedback();
    try {
      const res = await assignUsersToLab(activeLabId, targetRole, [
        raw.includes('@') ? { email: raw } : { nomorInduk: raw },
      ]);
      setSummary(res);
      if (res.succeeded > 0 && !identifierOverride) {
        setSingleIdentifier('');
      }
    } catch (e) {
      setErrorMsg(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = async () => {
    clearFeedback();
    try {
      const res = await downloadOrShareCsvTemplate(csvType);
      setNoticeMsg(
        res === 'url'
          ? `Template CSV ${csvType} dibuka lewat browser.`
          : `Template CSV ${csvType} dibagikan (fallback offline).`,
      );
    } catch (e) {
      setErrorMsg(getErrorMessage(e));
    }
  };

  const handleParseBulk = () => {
    clearFeedback();
    const parsed = parseCsvRows(csvText, csvType);
    if (parsed.length === 0) {
      setErrorMsg(`Masukkan minimal 1 baris CSV ${csvType} terlebih dahulu.`);
      setReviewRows([]);
      return;
    }
    setReviewRows(parsed);
  };

  const handleSubmitBulk = async (acceptedRows: CsvReviewRow[]) => {
    if (!activeLabId) {
      setErrorMsg('Pilih laboratorium tujuan terlebih dahulu.');
      return;
    }
    setSaving(true);
    clearFeedback();
    try {
      const rows = acceptedRows.map((r) => ({
        email: r.values.email ?? '',
        nomorInduk: csvType === 'praktikan' ? r.values.nim ?? '' : r.values.kode ?? '',
        nama: r.values.nama ?? '',
      }));
      const res = await assignUsersToLab(activeLabId, targetRole, rows);
      setSummary(res);
      if (res.failed.length === 0) {
        setReviewRows([]);
        setCsvText('');
      }
    } catch (e) {
      setErrorMsg(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async () => {
    if (!activeFromLabId || !activeToLabId || !selectedMemberUid) {
      setErrorMsg('Pilih lab asal, anggota yang dipindah, dan lab tujuan.');
      return;
    }
    setSaving(true);
    clearFeedback();
    try {
      await moveMemberBetweenLabs({
        uid: selectedMemberUid,
        fromLabId: activeFromLabId,
        toLabId: activeToLabId,
      });
      setNoticeMsg('Anggota berhasil dipindahkan ke lab tujuan (jadwal sesi tidak berubah).');
      setSelectedMemberUid('');
    } catch (e) {
      setErrorMsg(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const renderLabChips = (selected: string, onSelect: (id: string) => void, excludeId?: string) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {(labs ?? [])
        .filter((l) => l.id !== excludeId)
        .map((lab) => {
          const active = selected === lab.id;
          return (
            <Pressable
              key={lab.id}
              accessibilityRole="button"
              onPress={() => onSelect(lab.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{lab.nama}</Text>
            </Pressable>
          );
        })}
    </ScrollView>
  );

  const renderAssignTab = () => {
    const roleLabel = activeTab === 'asprak' ? 'Asprak' : 'Praktikan';
    const idLabel = activeTab === 'asprak' ? 'Kode Asprak' : 'NIM';

    return (
      <View style={styles.sectionStack}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Pilih Laboratorium Tujuan</Text>
          {renderLabChips(activeLabId, setSelectedLabId)}

          <Text style={styles.helperNote}>
            Anggota {roleLabel} saat ini di lab terpilih: {currentLabMembers.length} orang
          </Text>
          {currentLabMembers.length > 0 ? (
            <View style={styles.memberChipsWrap}>
              {currentLabMembers.map((m) => (
                <View key={m.id} style={styles.memberBadge}>
                  <Text style={styles.memberBadgeText}>
                    {m.nama} ({m.nomorInduk})
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.subModeRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setInsertMode('single');
              clearFeedback();
            }}
            style={[styles.subModeBtn, insertMode === 'single' && styles.subModeBtnActive]}
          >
            <Text style={[styles.subModeText, insertMode === 'single' && styles.subModeTextActive]}>
              Single Insert {roleLabel}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setInsertMode('bulk');
              clearFeedback();
            }}
            style={[styles.subModeBtn, insertMode === 'bulk' && styles.subModeBtnActive]}
          >
            <Text style={[styles.subModeText, insertMode === 'bulk' && styles.subModeTextActive]}>
              Bulk Insert {roleLabel} (CSV)
            </Text>
          </Pressable>
        </View>

        {insertMode === 'single' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>2. Tambah 1 {roleLabel} ke Lab</Text>
            <FormField
              label={`Email atau ${idLabel} Terdaftar`}
              value={singleIdentifier}
              onChangeText={setSingleIdentifier}
              placeholder={activeTab === 'asprak' ? 'asprak@example.com / ASP-01' : 'mhs@example.com / 2406...'}
              autoCapitalize="none"
            />
            <PrimaryButton
              label={`Tambahkan ${roleLabel}`}
              tone="asisten"
              loading={saving}
              onPress={() => void handleSingleAssign()}
            />

            <Text style={styles.subLabel}>Atau pilih cepat dari daftar akun {roleLabel}:</Text>
            {candidateUsers.length === 0 ? (
              <Text style={styles.helperNote}>Belum ada akun terdaftar dengan role {roleLabel}.</Text>
            ) : (
              <View style={styles.quickList}>
                {candidateUsers.map((u) => (
                  <Pressable
                    key={u.uid}
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => void handleSingleAssign(u.email)}
                    style={styles.quickUserRow}
                  >
                    <View style={styles.flex1}>
                      <Text style={styles.quickUserName}>{u.nama}</Text>
                      <Text style={styles.quickUserSub}>
                        {u.nomorInduk || '-'} · {u.email}
                      </Text>
                    </View>
                    <Text style={styles.quickAddText}>+ Tambah</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.sectionStack}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>2. Bulk Insert {roleLabel} ke Lab</Text>
              <View style={styles.row}>
                <View style={styles.flex1}>
                  <PrimaryButton
                    label={`Unduh Template CSV ${roleLabel}`}
                    tone="neutral"
                    onPress={() => void handleDownloadTemplate()}
                  />
                </View>
                <View style={styles.flex1}>
                  <PrimaryButton
                    label="Muat Contoh CSV"
                    tone="neutral"
                    onPress={() => setCsvText(getCsvDemoSample(csvType))}
                  />
                </View>
              </View>

              <TextInput
                multiline
                value={csvText}
                onChangeText={setCsvText}
                placeholder={`email,${activeTab === 'asprak' ? 'kode' : 'nim'},nama`}
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                style={styles.csvInput}
              />

              <PrimaryButton
                label="Muat ke Daftar Preview"
                tone="asisten"
                onPress={handleParseBulk}
              />
            </View>

            {reviewRows.length > 0 ? (
              <BulkReviewList
                type={csvType}
                rows={reviewRows}
                saving={saving}
                submitLabelPrefix={`Simpan ${roleLabel}`}
                onChangeRows={setReviewRows}
                onSubmit={(accepted) => void handleSubmitBulk(accepted)}
              />
            ) : null}
          </View>
        )}
      </View>
    );
  };

  const renderMoveTab = () => (
    <View style={styles.sectionStack}>
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          Perpindahan hanya memindahkan praktikan atau asprak/aslab antar laboratorium; jadwal praktikum tidak dipindahkan.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Jenis Anggota yang Dipindah</Text>
        <View style={styles.subModeRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMoveRole('praktikan');
              setSelectedMemberUid('');
            }}
            style={[styles.subModeBtn, moveRole === 'praktikan' && styles.subModeBtnActive]}
          >
            <Text style={[styles.subModeText, moveRole === 'praktikan' && styles.subModeTextActive]}>
              Praktikan
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMoveRole('staff');
              setSelectedMemberUid('');
            }}
            style={[styles.subModeBtn, moveRole === 'staff' && styles.subModeBtnActive]}
          >
            <Text style={[styles.subModeText, moveRole === 'staff' && styles.subModeTextActive]}>
              Asprak / Aslab
            </Text>
          </Pressable>
        </View>

        <Text style={styles.subLabel}>2. Laboratorium Asal</Text>
        {renderLabChips(activeFromLabId, (id) => {
          setFromLabId(id);
          setSelectedMemberUid('');
          if (toLabId === id) setToLabId('');
        })}

        <Text style={styles.subLabel}>3. Pilih Anggota dari Lab Asal</Text>
        {labMembersForMove.length === 0 ? (
          <Text style={styles.helperNote}>
            Belum ada anggota {moveRole === 'praktikan' ? 'Praktikan' : 'Asprak/Aslab'} di lab ini.
          </Text>
        ) : (
          <View style={styles.quickList}>
            {labMembersForMove.map((m) => {
              const selected = selectedMemberUid === m.uid;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  onPress={() => setSelectedMemberUid(m.uid)}
                  style={[styles.quickUserRow, selected && styles.quickUserSelected]}
                >
                  <View style={styles.flex1}>
                    <Text style={styles.quickUserName}>{m.nama}</Text>
                    <Text style={styles.quickUserSub}>
                      {m.role.toUpperCase()} · {m.nomorInduk} · {m.email}
                    </Text>
                  </View>
                  <Text style={styles.quickAddText}>{selected ? '✓ Dipilih' : 'Pilih'}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.subLabel}>4. Laboratorium Tujuan</Text>
        {renderLabChips(activeToLabId, setToLabId, activeFromLabId)}

        <PrimaryButton
          label="Pindahkan Anggota"
          tone="asisten"
          loading={saving}
          disabled={!selectedMemberUid || !activeToLabId}
          onPress={() => void handleMove()}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title="Distribusi & Pindah Lab"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/aslab' as Href))}
      />

      <View style={styles.tabsBar}>
        {(
          [
            ['praktikan', 'Praktikan'],
            ['asprak', 'Asprak'],
            ['pindah', 'Pindah Lab'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            onPress={() => handleTabChange(key)}
            style={[styles.tabPill, activeTab === key && styles.tabPillActive]}
          >
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {labsLoading ? (
        <LoadingState label="Memuat data laboratorium…" />
      ) : labsError ? (
        <ErrorState message={getErrorMessage(labsError)} onRetry={retryLabs} />
      ) : (labs?.length ?? 0) === 0 ? (
        <EmptyState
          icon="🏫"
          title="Belum ada laboratorium"
          subtitle="Buat laboratorium terlebih dahulu sebelum mendistribusikan praktikan atau asprak."
          action={
            <PrimaryButton
              label="Kelola Laboratorium"
              tone="asisten"
              onPress={() => router.push('/aslab/labs' as Href)}
            />
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {errorMsg ? <ErrorBanner message={errorMsg} /> : null}
          {noticeMsg ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>✅ {noticeMsg}</Text>
            </View>
          ) : null}
          {summary ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>
                Ringkasan: {summary.succeeded} berhasil · {summary.failed.length} gagal
              </Text>
              {summary.failed.map((f, i) => (
                <Text key={`${f.label}-${i}`} style={styles.summaryFailItem}>
                  • {f.label}: {f.reason}
                </Text>
              ))}
            </View>
          ) : null}

          {activeTab === 'pindah' ? renderMoveTab() : renderAssignTab()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  tabsBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
  },
  tabPillActive: { backgroundColor: colors.asisten },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.label },
  tabTextActive: { color: '#FFFFFF' },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 36 },
  sectionStack: { gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  subLabel: { fontSize: 13, fontWeight: '700', color: colors.label, marginTop: 4 },
  helperNote: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  chipsRow: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: '#EDE9FE', borderColor: colors.asisten },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.label },
  chipTextActive: { color: '#6D28D9' },
  memberChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  memberBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  memberBadgeText: { fontSize: 11, fontWeight: '600', color: colors.label },
  subModeRow: { flexDirection: 'row', gap: 8 },
  subModeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  subModeBtnActive: { backgroundColor: '#EDE9FE', borderColor: colors.asisten },
  subModeText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  subModeTextActive: { color: '#6D28D9' },
  quickList: { gap: 8 },
  quickUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickUserSelected: { backgroundColor: '#EDE9FE', borderColor: colors.asisten },
  quickUserName: { fontSize: 13, fontWeight: '700', color: colors.text },
  quickUserSub: { fontSize: 11, color: colors.textMuted },
  quickAddText: { fontSize: 12, fontWeight: '800', color: colors.asisten },
  csvInput: {
    minHeight: 100,
    maxHeight: 170,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    padding: 12,
    fontSize: 12,
    color: colors.text,
    textAlignVertical: 'top',
  },
  infoBanner: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
  },
  infoBannerText: { fontSize: 12, fontWeight: '600', color: '#1E40AF', lineHeight: 18 },
  noticeBox: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 10,
    padding: 10,
  },
  noticeText: { fontSize: 12, fontWeight: '700', color: '#166534' },
  summaryBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  summaryTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  summaryFailItem: { fontSize: 12, color: colors.dangerText },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
});
