import {
  DEFAULT_REMINDER_BODY,
  DEFAULT_REMINDER_TITLE,
} from '@/lib/notifications/messages';
import { KIND_LABELS, MONTH_LABELS, NTH_WEEK_OPTIONS, WEEKDAY_LABELS } from '@/lib/notifications/format';
import { resolveMonthDay } from '@/lib/notifications/scheduler';
import { MONTH_END, type ReminderInput, type ReminderKind } from '@/lib/notifications/types';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const DEFAULT_INPUT: ReminderInput = {
  title: DEFAULT_REMINDER_TITLE,
  body: DEFAULT_REMINDER_BODY,
  kind: 'interval',
  hour: 18,
  minute: 0,
  intervalDays: 1,
  enabled: true,
};

type Props = {
  initial?: ReminderInput;
  onSubmit: (input: ReminderInput) => void;
  onCancel: () => void;
  submitLabel: string;
};

export function ReminderForm({ initial = DEFAULT_INPUT, onSubmit, onCancel, submitLabel }: Props) {
  const [form, setForm] = useState<ReminderInput>(initial);
  const [showAndroidTimePicker, setShowAndroidTimePicker] = useState(false);

  const [intervalWeeks, setIntervalWeeks] = useState<number>(
    initial.kind === 'weekly' ? Math.max(1, Math.round((initial.intervalDays ?? 7) / 7)) : 1,
  );
  const [intervalMonths, setIntervalMonths] = useState<number>(
    initial.kind === 'monthly' ? (initial.intervalMonths ?? 1) : 1,
  );
  const [monthIntervalDay, setMonthIntervalDay] = useState<number>(
    initial.kind === 'monthly' && (initial.intervalMonths ?? 1) > 1
      ? (initial.monthdays?.[0] ?? 1)
      : 1,
  );

  const initAnchor = initial.anchorDate ? new Date(initial.anchorDate) : null;
  const [yearlyMonth, setYearlyMonth] = useState<number>(initAnchor?.getMonth() ?? 0);
  const [yearlyDay, setYearlyDay] = useState<number>(initAnchor?.getDate() ?? 1);
  const [yearlyEom, setYearlyEom] = useState<boolean>(
    initial.kind === 'yearly' && (initial.monthdays?.includes(MONTH_END) ?? false),
  );

  const [monthDayMode, setMonthDayMode] = useState<'day' | 'nth'>(
    initial.kind === 'monthly' && initial.nthWeek != null ? 'nth' : 'day',
  );
  const [monthNthWeek, setMonthNthWeek] = useState<number>(
    initial.kind === 'monthly' ? (initial.nthWeek ?? 1) : 1,
  );
  const [monthNthWeekday, setMonthNthWeekday] = useState<number>(
    initial.kind === 'monthly' ? (initial.nthWeekday ?? 1) : 1,
  );

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

    if (out.kind === 'interval') {
      const n = out.intervalDays ?? 1;
      out.intervalDays = n;
      if (n > 1) out.anchorDate = out.anchorDate ?? Date.now();
    }

    if (out.kind === 'weekly') {
      out.intervalDays = intervalWeeks * 7;
      if (intervalWeeks > 1) out.anchorDate = out.anchorDate ?? Date.now();
    }

    if (out.kind === 'yearly') {
      const now = new Date();
      const yr = now.getFullYear();
      if (yearlyEom) {
        out.anchorDate = new Date(yr, yearlyMonth, 1).getTime();
        out.monthdays = [MONTH_END];
      } else {
        out.monthdays = undefined;
        const day = resolveMonthDay(yr, yearlyMonth, yearlyDay);
        let d = new Date(yr, yearlyMonth, day);
        if (d <= now) {
          const dayNext = resolveMonthDay(yr + 1, yearlyMonth, yearlyDay);
          d = new Date(yr + 1, yearlyMonth, dayNext);
        }
        out.anchorDate = d.getTime();
      }
    }

    if (out.kind === 'monthly') {
      out.intervalMonths = intervalMonths;
      if (monthDayMode === 'nth') {
        out.nthWeek = monthNthWeek;
        out.nthWeekday = monthNthWeekday;
        out.monthdays = undefined;
      } else {
        out.nthWeek = undefined;
        out.nthWeekday = undefined;
        if (intervalMonths > 1) {
          out.monthdays = [monthIntervalDay];
          out.anchorDate = out.anchorDate ?? Date.now();
        }
      }
    }

    onSubmit(out);
  }

  const timeDate = new Date();
  timeDate.setHours(form.hour, form.minute, 0, 0);
  const timeLabel = `${String(form.hour).padStart(2, '0')}:${String(form.minute).padStart(2, '0')}`;
  const showTimePicker = Platform.OS === 'ios' || showAndroidTimePicker;

  return (
    <View style={styles.container}>
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
        scrollEnabled={false}
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

      {/* 日単位 */}
      {form.kind === 'interval' && (
        <>
          <Text style={styles.label}>間隔</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => set('intervalDays', Math.max(1, (form.intervalDays ?? 1) - 1))}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperNum}>
              {(form.intervalDays ?? 1) === 1 ? '毎日' : `${form.intervalDays}日ごと`}
            </Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => set('intervalDays', Math.min(365, (form.intervalDays ?? 1) + 1))}
            >
              <Text style={styles.stepperBtnText}>＋</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* 週単位 */}
      {form.kind === 'weekly' && (
        <>
          <Text style={styles.label}>間隔</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setIntervalWeeks((w) => Math.max(1, w - 1))}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperNum}>
              {intervalWeeks === 1 ? '毎週' : `${intervalWeeks}週ごと`}
            </Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setIntervalWeeks((w) => Math.min(8, w + 1))}
            >
              <Text style={styles.stepperBtnText}>＋</Text>
            </TouchableOpacity>
          </View>
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
        </>
      )}

      {/* 月単位 */}
      {form.kind === 'monthly' && (
        <>
          <Text style={styles.label}>間隔</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setIntervalMonths((m) => Math.max(1, m - 1))}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperNum}>
              {intervalMonths === 1 ? '毎月' : `${intervalMonths}ヶ月ごと`}
            </Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setIntervalMonths((m) => Math.min(12, m + 1))}
            >
              <Text style={styles.stepperBtnText}>＋</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>指定方法</Text>
          <View style={styles.kindRow}>
            {(['day', 'nth'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.chip, monthDayMode === mode && styles.chipActive]}
                onPress={() => setMonthDayMode(mode)}
              >
                <Text style={[styles.chipText, monthDayMode === mode && styles.chipTextActive]}>
                  {mode === 'day' ? '日付' : '第N曜日'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {monthDayMode === 'day' && intervalMonths === 1 && (
            <>
              <Text style={styles.label}>日付（複数選択可）</Text>
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
                  style={[
                    styles.mdChip,
                    styles.mdChipEom,
                    (form.monthdays?.includes(MONTH_END) ?? false) && styles.chipActive,
                  ]}
                  onPress={() => toggleMonthday(MONTH_END)}
                >
                  <Text
                    style={[
                      styles.mdChipText,
                      (form.monthdays?.includes(MONTH_END) ?? false) && styles.chipTextActive,
                    ]}
                  >
                    月末
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {monthDayMode === 'day' && intervalMonths > 1 && (
            <>
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
                  style={[
                    styles.mdChip,
                    styles.mdChipEom,
                    monthIntervalDay === MONTH_END && styles.chipActive,
                  ]}
                  onPress={() => setMonthIntervalDay(MONTH_END)}
                >
                  <Text style={[styles.mdChipText, monthIntervalDay === MONTH_END && styles.chipTextActive]}>
                    月末
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {monthDayMode === 'nth' && (
            <>
              <Text style={styles.label}>週</Text>
              <View style={styles.kindRow}>
                {NTH_WEEK_OPTIONS.map(({ label, value }) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, monthNthWeek === value && styles.chipActive]}
                    onPress={() => setMonthNthWeek(value)}
                  >
                    <Text style={[styles.chipText, monthNthWeek === value && styles.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>曜日</Text>
              <View style={styles.wdRow}>
                {WEEKDAY_LABELS.map((label, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.wdChip, monthNthWeekday === i && styles.chipActive]}
                    onPress={() => setMonthNthWeekday(i)}
                  >
                    <Text style={[styles.wdChipText, monthNthWeekday === i && styles.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </>
      )}

      {/* 年単位 */}
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
                style={[styles.mdChip, !yearlyEom && yearlyDay === day && styles.chipActive]}
                onPress={() => { setYearlyDay(day); setYearlyEom(false); }}
              >
                <Text style={[styles.mdChipText, !yearlyEom && yearlyDay === day && styles.chipTextActive]}>
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.mdChip, styles.mdChipEom, yearlyEom && styles.chipActive]}
              onPress={() => setYearlyEom(true)}
            >
              <Text style={[styles.mdChipText, yearlyEom && styles.chipTextActive]}>月末</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={styles.buttons}>
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

const styles = StyleSheet.create({
  container: { gap: 0 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#fff',
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },

  timeButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  timeButtonText: { fontSize: 28, fontWeight: '700', color: '#1E293B', letterSpacing: 2 },

  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { fontSize: 13, color: '#475569' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  wdRow: { flexDirection: 'row', gap: 6 },
  wdChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  wdChipText: { fontSize: 13, color: '#475569' },

  mdGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mdChip: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mdChipEom: { width: 52 },
  mdChipText: { fontSize: 12, color: '#475569' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 20, color: '#2563EB', lineHeight: 22 },
  stepperNum: { fontSize: 16, fontWeight: '600', color: '#1E293B', minWidth: 100, textAlign: 'center' },

  buttons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#E2E8F0', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#475569', fontWeight: '600' },
  submitBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' },
  submitBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
