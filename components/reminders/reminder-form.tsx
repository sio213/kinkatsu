import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { FormField } from '@/components/ui/form-field';
import { FormFieldStack } from '@/components/ui/form-field-stack';
import { Colors, Typography } from '@/constants/theme';
import { WEEKDAY_LABELS } from '@/lib/format';
import {
  DEFAULT_REMINDER_BODY,
  DEFAULT_REMINDER_TITLE,
} from '@/lib/notifications/messages';
import { KIND_LABELS, MONTH_LABELS, NTH_WEEK_OPTIONS, REMINDER_PRESETS } from '@/lib/notifications/format';
import { MONTH_END, type ReminderInput, type ReminderKind } from '@/lib/notifications/types';
import {
  reminderFormSchema,
  toFormValues,
  toReminderInput,
  type ReminderFormValues,
} from '@/lib/notifications/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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

// 日付選択チップの共通トグルロジック（毎月の日付・毎年の日で使う）。
// 31日と月末(MONTH_END)は同じ実日付を指しうるため相互排他にする
function toggleDayInArray(days: number[], day: number): number[] {
  let next: number[];
  if (days.includes(day)) {
    next = days.filter((d) => d !== day);
  } else if (day === MONTH_END) {
    next = [...days.filter((d) => d !== 31), MONTH_END];
  } else if (day === 31) {
    next = [...days.filter((d) => d !== MONTH_END), 31];
  } else {
    next = [...days, day];
  }
  return next.sort((a, b) => a - b);
}

// 曜日選択チップの共通トグルロジック（毎週の曜日・第N曜日の曜日で使う）
function toggleInArray(values: number[], value: number): number[] {
  const next = values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
  return next.sort((a, b) => a - b);
}

// 1〜31日+月末チップの複数選択グリッド（毎月の日付・毎年の日で使う共通UI）
function DayMultiSelectGrid({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (day: number) => void;
}) {
  return (
    <View style={styles.mdGrid}>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
        const isSelected = selected.includes(day);
        return (
          <TouchableOpacity
            key={day}
            style={[styles.mdChip, isSelected && styles.chipActive]}
            onPress={() => onToggle(day)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={`${day}日`}
          >
            <Text style={[styles.mdChipText, isSelected && styles.chipTextActive]}>
              {day}
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={[styles.mdChip, styles.mdChipEom, selected.includes(MONTH_END) && styles.chipActive]}
        onPress={() => onToggle(MONTH_END)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected.includes(MONTH_END) }}
        accessibilityLabel="月末"
      >
        <Text style={[styles.mdChipText, selected.includes(MONTH_END) && styles.chipTextActive]}>
          月末
        </Text>
      </TouchableOpacity>
    </View>
  );
}

type Props = {
  initial?: ReminderInput;
  onSubmit: (input: ReminderInput) => void;
  onCancel: () => void;
  submitLabel: string;
  showPresets?: boolean;
};

export function ReminderForm({ initial = DEFAULT_INPUT, onSubmit, onCancel, submitLabel, showPresets = true }: Props) {
  const [showAndroidTimePicker, setShowAndroidTimePicker] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<ReminderFormValues>({
    resolver: zodResolver(reminderFormSchema),
    defaultValues: toFormValues(initial),
  });
  const hasErrors = Object.keys(errors).length > 0;
  const submitDisabled = isSubmitted && hasErrors;

  const kind = watch('kind');
  const hour = watch('hour');
  const minute = watch('minute');
  const intervalDays = watch('intervalDays');
  const intervalWeeks = watch('intervalWeeks');
  const weekdays = watch('weekdays');
  const intervalMonths = watch('intervalMonths');
  const monthDayMode = watch('monthDayMode');
  const monthdays = watch('monthdays');
  const monthNthWeek = watch('monthNthWeek');
  const monthNthWeekdays = watch('monthNthWeekdays');
  const yearlyMonth = watch('yearlyMonth');
  const yearlyDays = watch('yearlyDays');

  // 月次「日付（複数選択）」の入力欄が表示されるのはこの条件のときだけなので、
  // バリデーション側もこれに合わせる（表示条件と検証条件がずれないよう一箇所にまとめる）
  const isMultiMonthdaySelection = kind === 'monthly' && monthDayMode === 'day';

  function applyPreset(preset: (typeof REMINDER_PRESETS)[number]) {
    if (preset.weekdays) {
      setValue('kind', 'weekly');
      setValue('weekdays', preset.weekdays);
      setValue('intervalWeeks', 1);
    } else {
      setValue('kind', 'interval');
      setValue('intervalDays', 1);
    }
  }

  const activePreset = REMINDER_PRESETS.find((p) => {
    if (p.weekdays) {
      return (
        kind === 'weekly' &&
        intervalWeeks === 1 &&
        JSON.stringify(weekdays ?? []) === JSON.stringify(p.weekdays)
      );
    }
    return kind === 'interval' && intervalDays === 1;
  });

  function toggleWeekday(wd: number) {
    setValue('weekdays', toggleInArray(weekdays, wd), { shouldValidate: isSubmitted });
  }

  function toggleMonthday(day: number) {
    setValue('monthdays', toggleDayInArray(monthdays, day), { shouldValidate: isSubmitted });
  }

  function toggleYearlyDay(day: number) {
    setValue('yearlyDays', toggleDayInArray(yearlyDays, day), { shouldValidate: isSubmitted });
  }

  function toggleMonthNthWeekday(wd: number) {
    setValue('monthNthWeekdays', toggleInArray(monthNthWeekdays, wd), { shouldValidate: isSubmitted });
  }

  function handleTimeChange(_: unknown, date?: Date) {
    if (Platform.OS === 'android') setShowAndroidTimePicker(false);
    if (!date) return;
    setValue('hour', date.getHours());
    setValue('minute', date.getMinutes());
  }

  function handleValid(values: ReminderFormValues) {
    onSubmit(toReminderInput(values));
  }

  const timeDate = new Date();
  timeDate.setHours(hour, minute, 0, 0);
  const timeLabel = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const showTimePicker = Platform.OS === 'ios' || showAndroidTimePicker;

  return (
    <>
      <FormFieldStack>
        {showPresets && (
          <FormField label="クイック設定">
            <View style={styles.kindRow}>
              {REMINDER_PRESETS.map((preset) => {
                const isActive = activePreset?.label === preset.label;
                return (
                  <TouchableOpacity
                    key={preset.label}
                    style={[styles.chip, isActive && styles.chipActive]}
                    onPress={() => applyPreset(preset)}
                    accessibilityLabel={`${preset.label}プリセット`}
                  >
                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FormField>
        )}

        <FormField label="タイトル" required error={errors.title?.message}>
          <Controller
            control={control}
            name="title"
            render={({ field: { value, onChange } }) => (
              <BoxedTextInput
                height={38}
                boxStyle={styles.inputBox}
                style={styles.inputText}
                value={value}
                onChangeText={onChange}
                placeholder="タイトル"
              />
            )}
          />
        </FormField>

        <FormField label="通知内容" required error={errors.body?.message}>
          <Controller
            control={control}
            name="body"
            render={({ field: { value, onChange } }) => (
              <TextInput
                style={styles.inputMulti}
                value={value}
                onChangeText={onChange}
                placeholder="通知内容"
                multiline
                scrollEnabled={false}
              />
            )}
          />
        </FormField>

        <FormField label="時刻">
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
        </FormField>

        <FormField label="繰り返し">
          <View style={styles.kindRow}>
            {(Object.keys(KIND_LABELS) as ReminderKind[]).map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, kind === k && styles.chipActive]}
                onPress={() => setValue('kind', k)}
              >
                <Text style={[styles.chipText, kind === k && styles.chipTextActive]}>
                  {KIND_LABELS[k]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </FormField>

        {/* 日単位 */}
        {kind === 'interval' && (
          <FormField label="間隔">
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setValue('intervalDays', Math.max(1, intervalDays - 1))}
              >
                <Text style={styles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperNum}>
                {intervalDays === 1 ? '毎日' : `${intervalDays}日ごと`}
              </Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setValue('intervalDays', Math.min(365, intervalDays + 1))}
              >
                <Text style={styles.stepperBtnText}>＋</Text>
              </TouchableOpacity>
            </View>
          </FormField>
        )}

        {/* 週単位 */}
        {kind === 'weekly' && (
          <>
            <FormField label="間隔">
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setValue('intervalWeeks', Math.max(1, intervalWeeks - 1))}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperNum}>
                  {intervalWeeks === 1 ? '毎週' : `${intervalWeeks}週ごと`}
                </Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setValue('intervalWeeks', Math.min(8, intervalWeeks + 1))}
                >
                  <Text style={styles.stepperBtnText}>＋</Text>
                </TouchableOpacity>
              </View>
            </FormField>
            <FormField label="曜日" required error={errors.weekdays?.message}>
              <View style={styles.wdRow}>
                {WEEKDAY_LABELS.map((label, i) => {
                  const selected = weekdays.includes(i);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.wdChip, selected && styles.chipActive]}
                      onPress={() => toggleWeekday(i)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={label}
                    >
                      <Text style={[styles.wdChipText, selected && styles.chipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </FormField>
          </>
        )}

        {/* 月単位 */}
        {kind === 'monthly' && (
          <>
            <FormField label="間隔">
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setValue('intervalMonths', Math.max(1, intervalMonths - 1))}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperNum}>
                  {intervalMonths === 1 ? '毎月' : `${intervalMonths}ヶ月ごと`}
                </Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setValue('intervalMonths', Math.min(12, intervalMonths + 1))}
                >
                  <Text style={styles.stepperBtnText}>＋</Text>
                </TouchableOpacity>
              </View>
            </FormField>

            <FormField label="指定方法">
              <View style={styles.kindRow}>
                {(['day', 'nth'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.chip, monthDayMode === mode && styles.chipActive]}
                    onPress={() => setValue('monthDayMode', mode)}
                  >
                    <Text style={[styles.chipText, monthDayMode === mode && styles.chipTextActive]}>
                      {mode === 'day' ? '日付' : '第N曜日'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FormField>

            {isMultiMonthdaySelection && (
              <FormField
                label="日付（複数選択可）"
                required
                error={errors.monthdays?.message}
              >
                <DayMultiSelectGrid selected={monthdays} onToggle={toggleMonthday} />
              </FormField>
            )}

            {monthDayMode === 'nth' && (
              <>
                <FormField label="週">
                  <View style={styles.kindRow}>
                    {NTH_WEEK_OPTIONS.map(({ label, value }) => (
                      <TouchableOpacity
                        key={value}
                        style={[styles.chip, monthNthWeek === value && styles.chipActive]}
                        onPress={() => setValue('monthNthWeek', value)}
                      >
                        <Text style={[styles.chipText, monthNthWeek === value && styles.chipTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </FormField>
                <FormField
                  label="曜日"
                  required
                  error={errors.monthNthWeekdays?.message}
                >
                  <View style={styles.wdRow}>
                    {WEEKDAY_LABELS.map((label, i) => {
                      const selected = monthNthWeekdays.includes(i);
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[styles.wdChip, selected && styles.chipActive]}
                          onPress={() => toggleMonthNthWeekday(i)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          accessibilityLabel={label}
                        >
                          <Text style={[styles.wdChipText, selected && styles.chipTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </FormField>
              </>
            )}
          </>
        )}

        {/* 年単位 */}
        {kind === 'yearly' && (
          <>
            <FormField label="月">
              <View style={styles.kindRow}>
                {MONTH_LABELS.map((label, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.chip, yearlyMonth === i && styles.chipActive]}
                    onPress={() => setValue('yearlyMonth', i)}
                  >
                    <Text style={[styles.chipText, yearlyMonth === i && styles.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FormField>
            <FormField
              label="日（複数選択可）"
              required
              error={errors.yearlyDays?.message}
            >
              <DayMultiSelectGrid selected={yearlyDays} onToggle={toggleYearlyDay} />
            </FormField>
          </>
        )}
      </FormFieldStack>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          accessibilityLabel="キャンセル"
        >
          <Text style={styles.cancelBtnText}>キャンセル</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
          onPress={handleSubmit(handleValid)}
          disabled={submitDisabled}
          accessibilityLabel={submitLabel}
        >
          <Text style={styles.submitBtnText}>{submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // タイトルは箱(枠線・背景・角丸・横padding)とTextInput本体をBoxedTextInputで分離
  // している。border/borderColor/borderRadius/文字色は既定値のままなのでここでは
  // paddingHorizontalの差分だけ持つ。詳細はcomponents/ui/boxed-text-input.tsxのコメント参照
  inputBox: { paddingHorizontal: 12 },
  inputText: Typography.body,

  // 通知内容欄は複数行で伸びる仕様のためBoxedTextInputを使わず、そのままの高さ可変で表示する
  inputMulti: {
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    minHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    textAlignVertical: 'top',
  },

  timeButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  timeButtonText: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary, letterSpacing: 2 },

  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { ...Typography.footnote, color: Colors.textSecondary },
  chipTextActive: { color: Colors.onAccent, fontWeight: '600' },

  wdRow: { flexDirection: 'row', gap: 6 },
  wdChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  wdChipText: { ...Typography.footnote, color: Colors.textSecondary },

  mdGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mdChip: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mdChipEom: { width: 52 },
  mdChipText: { ...Typography.caption, color: Colors.textSecondary },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 20, color: Colors.accent, lineHeight: 22 },
  stepperNum: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, minWidth: 100, textAlign: 'center' },

  buttons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { ...Typography.bodyStrong, color: Colors.textSecondary },
  submitBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: Colors.textPlaceholder },
  submitBtnText: { ...Typography.bodyStrong, color: Colors.onAccent },
});
