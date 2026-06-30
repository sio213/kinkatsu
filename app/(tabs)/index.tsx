import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { Reminder } from '@/db/schema';
import { useReminders } from '@/hooks/use-reminders';
import {
  DEFAULT_REMINDER_BODY,
  DEFAULT_REMINDER_TITLE,
} from '@/lib/notifications/messages';
import {
  ensurePermission,
  getPermissionState,
  openSettings,
} from '@/lib/notifications/permissions';
import { resolveMonthDay } from '@/lib/notifications/scheduler';
import { MONTH_END, type ReminderInput, type ReminderKind } from '@/lib/notifications/types';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const KIND_LABELS: Record<ReminderKind, string> = {
  daily: '毎日',
  weekly: '毎週',
  biweekly: 'N週ごと',
  monthly: '毎月',
  yearly: '毎年',
  interval: 'N日ごと',
  month_interval: 'Nヶ月ごと',
};

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function formatNextFire(date: Date | null): string {
  if (!date) return '—';
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `次回: ${m}/${d} ${h}:${min}`;
}

function formatKindSummary(r: Reminder): string {
  const kind = r.kind as ReminderKind;
  const h = String(r.hour).padStart(2, '0');
  const m = String(r.minute).padStart(2, '0');
  const time = `${h}:${m}`;

  if (kind === 'daily') return `毎日 ${time}`;
  if (kind === 'weekly') {
    const wds: number[] = r.weekdays ? JSON.parse(r.weekdays) : [];
    return `毎週 ${wds.map((d) => WEEKDAY_LABELS[d]).join('・')} ${time}`;
  }
  if (kind === 'biweekly') {
    const wds: number[] = r.weekdays ? JSON.parse(r.weekdays) : [];
    const weeks = r.intervalDays ? Math.round(r.intervalDays / 7) : 2;
    return `${weeks}週間ごと ${wds.map((d) => WEEKDAY_LABELS[d]).join('・')} ${time}`;
  }
  if (kind === 'monthly') {
    const mds: number[] = r.monthdays ? JSON.parse(r.monthdays) : [];
    return `毎月 ${mds.map((d) => (d === MONTH_END ? '月末' : `${d}日`)).join('・')} ${time}`;
  }
  if (kind === 'yearly' && r.anchorDate) {
    const a = new Date(r.anchorDate);
    return `毎年 ${a.getMonth() + 1}/${a.getDate()} ${time}`;
  }
  if (kind === 'interval') return `${r.intervalDays}日ごと ${time}`;
  if (kind === 'month_interval') {
    const months = r.intervalMonths ?? 2;
    const mds: number[] = r.monthdays ? JSON.parse(r.monthdays) : [];
    const dayLabel = mds[0] === MONTH_END ? '月末' : `${mds[0] ?? 1}日`;
    return `${months}ヶ月ごと ${dayLabel} ${time}`;
  }
  return time;
}

function defaultInput(): ReminderInput {
  return {
    title: DEFAULT_REMINDER_TITLE,
    body: DEFAULT_REMINDER_BODY,
    kind: 'daily',
    hour: 7,
    minute: 0,
    enabled: true,
  };
}

// ── リマインダーフォーム ─────────────────────────────

type FormProps = {
  initial: ReminderInput;
  onSubmit: (input: ReminderInput) => void;
  onCancel: () => void;
  submitLabel: string;
};

function ReminderForm({ initial, onSubmit, onCancel, submitLabel }: FormProps) {
  const [form, setForm] = useState<ReminderInput>(initial);
  const [showAndroidTimePicker, setShowAndroidTimePicker] = useState(false);

  // biweekly: N週間
  const [intervalWeeks, setIntervalWeeks] = useState<number>(
    initial.intervalDays ? Math.max(2, Math.round(initial.intervalDays / 7)) : 2,
  );

  // month_interval: Nヶ月
  const [intervalMonths, setIntervalMonths] = useState<number>(initial.intervalMonths ?? 2);

  // month_interval: 何日に発火するか（monthdays[0] で管理）
  const [monthIntervalDay, setMonthIntervalDay] = useState<number>(
    initial.monthdays?.[0] ?? 1,
  );

  // yearly: 月と日
  const initAnchor = initial.anchorDate ? new Date(initial.anchorDate) : null;
  const [yearlyMonth, setYearlyMonth] = useState<number>(initAnchor?.getMonth() ?? 0);
  const [yearlyDay, setYearlyDay] = useState<number>(initAnchor?.getDate() ?? 1);

  function set<K extends keyof ReminderInput>(key: K, val: ReminderInput[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function toggleWeekday(wd: number) {
    const current = form.weekdays ?? [];
    const next = current.includes(wd)
      ? current.filter((d) => d !== wd)
      : [...current, wd].sort((a, b) => a - b);
    set('weekdays', next);
  }

  function toggleMonthday(day: number) {
    const current = form.monthdays ?? [];
    let next: number[];
    if (current.includes(day)) {
      next = current.filter((d) => d !== day);
    } else if (day === MONTH_END) {
      next = [...current.filter((d) => d !== 31), MONTH_END];
    } else if (day === 31) {
      next = [...current.filter((d) => d !== MONTH_END), 31];
    } else {
      next = [...current, day];
    }
    set('monthdays', next.sort((a, b) => a - b));
  }

  function handleTimeChange(_: unknown, date?: Date) {
    if (Platform.OS === 'android') setShowAndroidTimePicker(false);
    if (!date) return;
    set('hour', date.getHours());
    set('minute', date.getMinutes());
  }

  function handleSubmit() {
    const out = { ...form };
    if (out.kind === 'biweekly') {
      out.intervalDays = intervalWeeks * 7;
    }
    if (out.kind === 'yearly') {
      const now = new Date();
      const yr = now.getFullYear();
      const day = resolveMonthDay(yr, yearlyMonth, yearlyDay);
      let d = new Date(yr, yearlyMonth, day);
      if (d <= now) {
        const dayNext = resolveMonthDay(yr + 1, yearlyMonth, yearlyDay);
        d = new Date(yr + 1, yearlyMonth, dayNext);
      }
      out.anchorDate = d.getTime();
    }
    if (out.kind === 'month_interval') {
      out.intervalMonths = intervalMonths;
      out.monthdays = [monthIntervalDay];
      out.anchorDate = out.anchorDate ?? Date.now();
    }
    onSubmit(out);
  }

  const timeDate = new Date();
  timeDate.setHours(form.hour, form.minute, 0, 0);
  const timeLabel = `${String(form.hour).padStart(2, '0')}:${String(form.minute).padStart(2, '0')}`;

  const showTimePicker = Platform.OS === 'ios' || showAndroidTimePicker;

  return (
    <View style={styles.formContainer}>
      <Text style={styles.label}>タイトル</Text>
      <TextInput
        style={styles.input}
        value={form.title}
        onChangeText={(v) => set('title', v)}
        placeholder="タイトル"
      />

      <Text style={styles.label}>通知内容</Text>
      <TextInput
        style={[styles.input, styles.inputMulti]}
        value={form.body}
        onChangeText={(v) => set('body', v)}
        placeholder="通知内容"
        multiline
      />

      <Text style={styles.label}>時刻</Text>
      {Platform.OS === 'android' && (
        <TouchableOpacity
          style={styles.timeButton}
          onPress={() => setShowAndroidTimePicker(true)}
        >
          <Text style={styles.timeButtonText}>{timeLabel}</Text>
        </TouchableOpacity>
      )}
      {showTimePicker && (
        <DateTimePicker
          value={timeDate}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
        />
      )}

      <Text style={styles.label}>繰り返し</Text>
      <View style={styles.kindRow}>
        {(Object.keys(KIND_LABELS) as ReminderKind[]).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.chip, form.kind === k && styles.chipActive]}
            onPress={() => set('kind', k)}
          >
            <Text style={[styles.chipText, form.kind === k && styles.chipTextActive]}>
              {KIND_LABELS[k]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 曜日 (weekly / biweekly) */}
      {(form.kind === 'weekly' || form.kind === 'biweekly') && (
        <>
          {form.kind === 'biweekly' && (
            <>
              <Text style={styles.label}>間隔</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setIntervalWeeks((w) => Math.max(2, w - 1))}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperNum}>{intervalWeeks}週間ごと</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setIntervalWeeks((w) => Math.min(8, w + 1))}
                >
                  <Text style={styles.stepperBtnText}>＋</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          <Text style={styles.label}>曜日</Text>
          <View style={styles.wdRow}>
            {WEEKDAY_LABELS.map((label, i) => {
              const selected = form.weekdays?.includes(i) ?? false;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.wdChip, selected && styles.chipActive]}
                  onPress={() => toggleWeekday(i)}
                >
                  <Text style={[styles.wdChipText, selected && styles.chipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {form.kind === 'weekly' && form.weekdays?.length === 7 && (
            <Text style={styles.hint}>全曜日選択 → 毎日に自動変換されます</Text>
          )}
        </>
      )}

      {/* 日付 (monthly) */}
      {form.kind === 'monthly' && (
        <>
          <Text style={styles.label}>日付</Text>
          <View style={styles.mdGrid}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
              const selected = form.monthdays?.includes(day) ?? false;
              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.mdChip, selected && styles.chipActive]}
                  onPress={() => toggleMonthday(day)}
                >
                  <Text style={[styles.mdChipText, selected && styles.chipTextActive]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.mdChip, styles.mdChipEom, (form.monthdays?.includes(MONTH_END) ?? false) && styles.chipActive]}
              onPress={() => toggleMonthday(MONTH_END)}
            >
              <Text style={[styles.mdChipText, (form.monthdays?.includes(MONTH_END) ?? false) && styles.chipTextActive]}>
                月末
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* 月/日 (yearly) */}
      {form.kind === 'yearly' && (
        <>
          <Text style={styles.label}>月</Text>
          <View style={styles.kindRow}>
            {MONTH_LABELS.map((label, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.chip, yearlyMonth === i && styles.chipActive]}
                onPress={() => setYearlyMonth(i)}
              >
                <Text style={[styles.chipText, yearlyMonth === i && styles.chipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>日</Text>
          <View style={styles.mdGrid}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <TouchableOpacity
                key={day}
                style={[styles.mdChip, yearlyDay === day && styles.chipActive]}
                onPress={() => setYearlyDay(day)}
              >
                <Text style={[styles.mdChipText, yearlyDay === day && styles.chipTextActive]}>
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Nヶ月ごと (month_interval) */}
      {form.kind === 'month_interval' && (
        <>
          <Text style={styles.label}>間隔（ヶ月）</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setIntervalMonths((m) => Math.max(2, m - 1))}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperNum}>{intervalMonths}ヶ月ごと</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setIntervalMonths((m) => Math.min(12, m + 1))}
            >
              <Text style={styles.stepperBtnText}>＋</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.label}>日付</Text>
          <View style={styles.mdGrid}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <TouchableOpacity
                key={day}
                style={[styles.mdChip, monthIntervalDay === day && styles.chipActive]}
                onPress={() => setMonthIntervalDay(day)}
              >
                <Text style={[styles.mdChipText, monthIntervalDay === day && styles.chipTextActive]}>
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.mdChip, styles.mdChipEom, monthIntervalDay === MONTH_END && styles.chipActive]}
              onPress={() => setMonthIntervalDay(MONTH_END)}
            >
              <Text style={[styles.mdChipText, monthIntervalDay === MONTH_END && styles.chipTextActive]}>
                月末
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* N日ごと (interval) */}
      {form.kind === 'interval' && (
        <>
          <Text style={styles.label}>間隔（日数）</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => set('intervalDays', Math.max(2, (form.intervalDays ?? 2) - 1))}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperNum}>{form.intervalDays ?? 2}日ごと</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => set('intervalDays', Math.min(365, (form.intervalDays ?? 2) + 1))}
            >
              <Text style={styles.stepperBtnText}>＋</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={styles.formButtons}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>キャンセル</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>{submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── メイン画面 ───────────────────────────────────────

export default function HomeScreen() {
  const { reminders, createReminder, updateReminder, toggleReminder, removeReminder, getNextFire } =
    useReminders();

  const [permState, setPermState] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Reminder | null>(null);

  useEffect(() => {
    getPermissionState().then(setPermState);
  }, []);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((r: Reminder) => {
    setEditTarget(r);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditTarget(null);
  }, []);

  const handleSubmit = useCallback(
    async (input: ReminderInput) => {
      const perm = await ensurePermission();
      setPermState(perm);
      if (perm !== 'granted') {
        Alert.alert('通知が許可されていません', '設定から通知を有効にしてください。');
        return;
      }
      try {
        if (editTarget) {
          await updateReminder(editTarget.id, input);
        } else {
          await createReminder(input);
        }
        closeForm();
      } catch {
        Alert.alert('エラー', 'リマインダーの保存に失敗しました。');
      }
    },
    [editTarget, createReminder, updateReminder, closeForm],
  );

  const handleDelete = useCallback(
    (id: number) => {
      Alert.alert('削除', 'このリマインダーを削除しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => removeReminder(id) },
      ]);
    },
    [removeReminder],
  );

  const editInitial = useCallback(
    (r: Reminder): ReminderInput => ({
      title: r.title,
      body: r.body,
      kind: r.kind as ReminderKind,
      hour: r.hour,
      minute: r.minute,
      weekdays: r.weekdays ? JSON.parse(r.weekdays) : undefined,
      monthdays: r.monthdays ? JSON.parse(r.monthdays) : undefined,
      anchorDate: r.anchorDate ?? undefined,
      intervalDays: r.intervalDays ?? undefined,
      intervalMonths: r.intervalMonths ?? undefined,
      enabled: r.enabled,
    }),
    [],
  );

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }
    >
      {/* 権限バナー */}
      {permState === 'denied' && (
        <View style={styles.permBanner}>
          <Text style={styles.permBannerText}>
            通知がOFFになっています。設定から有効にしてください。
          </Text>
          <TouchableOpacity style={styles.permBannerBtn} onPress={openSettings}>
            <Text style={styles.permBannerBtnText}>設定を開く</Text>
          </TouchableOpacity>
        </View>
      )}
      {permState === 'undetermined' && (
        <View style={styles.permBanner}>
          <Text style={styles.permBannerText}>通知の許可が必要です。</Text>
          <TouchableOpacity
            style={styles.permBannerBtn}
            onPress={async () => {
              const r = await ensurePermission();
              setPermState(r);
            }}
          >
            <Text style={styles.permBannerBtnText}>許可する</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* リマインダーセクション */}
      <ThemedView style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText type="subtitle">筋トレリマインダー</ThemedText>
          {!showForm && (
            <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
              <Text style={styles.addBtnText}>＋ 追加</Text>
            </TouchableOpacity>
          )}
        </View>

        {reminders.length === 0 && !showForm && (
          <Text style={styles.empty}>リマインダーがありません</Text>
        )}

        {reminders.map((r) => {
          const isEditing = editTarget?.id === r.id && showForm;
          return (
            <View key={r.id}>
              <View style={styles.reminderCard}>
                <View style={styles.reminderCardMain}>
                  <View style={styles.reminderInfo}>
                    <Text style={styles.reminderTitle}>{r.title}</Text>
                    <Text style={styles.reminderSummary}>{formatKindSummary(r)}</Text>
                    <Text style={styles.reminderNext}>{formatNextFire(getNextFire(r))}</Text>
                  </View>
                  <Switch
                    value={r.enabled}
                    onValueChange={(v) => toggleReminder(r.id, v)}
                  />
                </View>
                <View style={styles.reminderActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => (isEditing ? closeForm() : openEdit(r))}
                  >
                    <Text style={styles.actionBtnText}>{isEditing ? '閉じる' : '編集'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnDanger]}
                    onPress={() => handleDelete(r.id)}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>削除</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {isEditing && (
                <View style={styles.inlineFormWrapper}>
                  <Text style={styles.formTitle}>リマインダーを編集</Text>
                  <ReminderForm
                    initial={editInitial(r)}
                    onSubmit={handleSubmit}
                    onCancel={closeForm}
                    submitLabel="保存"
                  />
                </View>
              )}
            </View>
          );
        })}

        {/* 追加フォーム（編集中でない時） */}
        {showForm && !editTarget && (
          <View style={styles.inlineFormWrapper}>
            <Text style={styles.formTitle}>リマインダーを追加</Text>
            <ReminderForm
              initial={defaultInput()}
              onSubmit={handleSubmit}
              onCancel={closeForm}
              submitLabel="追加"
            />
          </View>
        )}
      </ThemedView>
    </ParallaxScrollView>
  );
}

// ── スタイル ─────────────────────────────────────────

const styles = StyleSheet.create({
  reactLogo: { height: 178, width: 290, bottom: 0, left: 0, position: 'absolute' },

  section: { gap: 12, paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty: { color: '#999', textAlign: 'center', paddingVertical: 16 },

  permBanner: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 12, marginBottom: 8, gap: 8 },
  permBannerText: { color: '#92400E', fontSize: 13 },
  permBannerBtn: { backgroundColor: '#D97706', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start' },
  permBannerBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  reminderCard: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, gap: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  reminderCardMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderInfo: { flex: 1, gap: 2 },
  reminderTitle: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  reminderSummary: { fontSize: 13, color: '#64748B' },
  reminderNext: { fontSize: 11, color: '#94A3B8' },
  toggleArea: { alignItems: 'center', gap: 2 },
  toggleLabel: { fontSize: 10, color: '#94A3B8' },
  reminderActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#E2E8F0' },
  actionBtnText: { fontSize: 12, color: '#334155', fontWeight: '500' },
  actionBtnDanger: { backgroundColor: '#FEE2E2' },
  actionBtnDangerText: { color: '#DC2626' },

  inlineFormWrapper: { backgroundColor: '#F1F5F9', borderRadius: 10, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 4 },
  formTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 8 },

  formContainer: { gap: 0 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: '#1E293B', backgroundColor: '#fff' },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: '#94A3B8', marginTop: 4 },

  timeButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, alignSelf: 'flex-start' },
  timeButtonText: { fontSize: 28, fontWeight: '700', color: '#1E293B', letterSpacing: 2 },

  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { fontSize: 13, color: '#475569' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  wdRow: { flexDirection: 'row', gap: 6 },
  wdChip: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  wdChipText: { fontSize: 13, color: '#475569' },

  mdGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mdChip: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  mdChipEom: { width: 52 },
  mdChipText: { fontSize: 12, color: '#475569' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 20, color: '#2563EB', lineHeight: 22 },
  stepperNum: { fontSize: 16, fontWeight: '600', color: '#1E293B', minWidth: 100, textAlign: 'center' },

  formButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#E2E8F0', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#475569', fontWeight: '600' },
  submitBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' },
  submitBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
