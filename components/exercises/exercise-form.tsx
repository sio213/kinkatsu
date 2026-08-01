import { chipStyles } from '@/components/exercises/chip-styles';
import { MeasurementTypeField } from '@/components/exercises/measurement-type-field';
import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { FormField } from '@/components/ui/form-field';
import { FormFieldStack } from '@/components/ui/form-field-stack';
import { FormLabel } from '@/components/ui/form-label';
import { useScrollToFirstError } from '@/components/ui/form-scroll-context';
import { Switch } from '@/components/ui/switch';
import { Colors, Typography } from '@/constants/theme';
import {
  EXERCISE_CATEGORIES,
  getCategoryLabel,
  resolveMeasurementType,
  type ExerciseCategory,
} from '@/lib/exercises/constants';
import {
  exerciseSchema,
  type ExerciseFormValues,
} from '@/lib/exercises/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function toExerciseCategory(value: string | undefined): ExerciseCategory | undefined {
  return (EXERCISE_CATEGORIES as readonly string[]).includes(value ?? '')
    ? (value as ExerciseCategory)
    : undefined;
}

/**
 * 記録がある種目で「記録する項目」を変えたときの確認。
 *
 * **保存を押した時に1回だけ出す。** 選択した瞬間に出すと、他の項目を編集している最中にも
 * 割り込み、キャンセルのたびに選択が巻き戻る往復が生まれる（削除確認と同じ「保存直前に一度だけ」に揃える）。
 *
 * 本文の3文は「記録がある → 影響 → 復元可能」の順で固定。setsは計測タイプごとの列を持つ1枚の
 * ワイドテーブルで、記録行自体は計測タイプを持たない。つまり変更してもDBの値は消えず、
 * 元の項目に戻せば表示も完全に戻る——だから赤（destructive）にはしない。
 *
 * 件数は出さない。useExerciseRecordCountはカード（workoutSessionExercises）単位で数えるため、
 * 同じ日に同じ種目を2枚のカードに分けた日があると、種目詳細の記録一覧が出す「全N件」（日単位）と
 * 食い違う。同じ種目なのに画面によって数字が違って見えるくらいなら出さない方がよい（2026-08-01）
 */
function confirmMeasurementTypeChange(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      '記録する項目を変更しますか？',
      'この種目にはすでに記録があります。変更すると、これまでの記録がグラフや記録一覧に表示されなくなる場合があります。記録は削除されず、元に戻せば再表示されます。',
      [
        { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
        { text: '変更する', onPress: () => resolve(true) },
      ],
      // optionsに{ cancelable: true }を渡さないこと。Androidで戻る操作でも閉じられるようになるが、
      // その経路はonDismissでしかresolveできず、渡し忘れるとPromiseが解決せずisSubmittingが
      // trueのまま＝保存ボタンが永久にdisabledになる。既定のcancelable:falseなら戻るでは閉じない
    );
  });
}

export type ExerciseFormHandle = {
  submit: () => void;
  // 種目名欄へフォーカスする。画面遷移アニメーション中にキーボードが被さって
  // 表示が乱れるのを避けるため、呼び出し側が遷移完了後の適切なタイミングで呼ぶ
  focusName: () => void;
};

type Props = {
  initial?: {
    name?: string;
    category?: string;
    note?: string | null;
    favorite?: boolean;
    formPoints?: string[] | null;
    source?: string;
    measurementType?: string | null;
  };
  /**
   * その種目の記録件数（編集画面がuseExerciseRecordCountから渡す）。0より大きいときだけ、
   * 「記録する項目」を変えて保存しようとした時に確認ダイアログを出す。新規作成では記録が
   * 存在しえないため渡さない
   */
  recordCount?: number;
  onSubmit: (values: ExerciseFormValues) => void;
  onSubmitDisabledChange?: (disabled: boolean) => void;
};

export const ExerciseForm = forwardRef<ExerciseFormHandle, Props>(function ExerciseForm(
  { initial, recordCount = 0, onSubmit, onSubmitDisabledChange },
  ref,
) {
  const nameInputRef = useRef<TextInput>(null);
  const {
    control,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitted, isSubmitting, dirtyFields },
  } = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseSchema),
    defaultValues: {
      name: initial?.name ?? '',
      category: toExerciseCategory(initial?.category),
      note: initial?.note ?? '',
      favorite: initial?.favorite ?? false,
      formPoints: initial?.formPoints?.length ? initial.formPoints : [''],
      // 想定外のDB値でも保存できなくならないよう、既知の5値に丸めてから初期値にする
      // （新規作成は初期値なし＝resolveMeasurementTypeが weight_reps を返す）
      measurementType: resolveMeasurementType(initial?.measurementType),
    },
  });
  const hasErrors = Object.keys(errors).length > 0;
  const submitDisabled = isSubmitting || (isSubmitted && hasErrors);
  // プリセット種目は詳細画面でgetGuide()の解説を表示するため、フォームのポイントは編集不可
  // （メモ欄と役割が重複する上、保存しても表示されない「書き込み専用」状態になるのを避ける）
  const isPreset = initial?.source === 'preset';
  const scrollToFirstError = useScrollToFirstError();

  // 記録がある種目で「記録する項目」が変わっていたら、保存の直前に一度だけ確認する。
  // キャンセルされたら選択を開いた時点の値に戻し、フォームには留まる。
  //
  // 「変わっているか」はRHFのdirtyFieldsで見る（defaultValuesと突き合わせた結果を別途refに
  // 持つと、将来resetを足したときにrefだけ取り残されて誤検知する）。一度別の値にしてから元に
  // 戻した場合もRHFがdirtyを解除するため、確認は出ない
  const measurementTypeChanged = dirtyFields.measurementType === true;
  const submitWithConfirm = useCallback(
    () =>
      handleSubmit(async (values) => {
        if (recordCount > 0 && measurementTypeChanged) {
          if (!(await confirmMeasurementTypeChange())) {
            resetField('measurementType');
            return;
          }
        }
        onSubmit(values);
      }, scrollToFirstError)(),
    [handleSubmit, measurementTypeChanged, onSubmit, recordCount, resetField, scrollToFirstError],
  );

  useImperativeHandle(
    ref,
    () => ({
      submit: submitWithConfirm,
      focusName: () => nameInputRef.current?.focus(),
    }),
    [submitWithConfirm],
  );

  useEffect(() => {
    onSubmitDisabledChange?.(submitDisabled);
  }, [submitDisabled, onSubmitDisabledChange]);

  return (
    <FormFieldStack>
      <FormField name="name" label="種目名" required error={errors.name?.message}>
        <Controller
          control={control}
          name="name"
          render={({ field: { value, onChange } }) => (
            <BoxedTextInput
              ref={nameInputRef}
              height={40}
              boxStyle={styles.inputBox}
              style={styles.inputText}
              value={value}
              onChangeText={onChange}
              placeholder="種目名"
              returnKeyType="done"
              accessibilityLabel="種目名"
            />
          )}
        />
      </FormField>

      <FormField name="category" label="カテゴリ" required error={errors.category?.message}>
        <Controller
          control={control}
          name="category"
          render={({ field: { value, onChange } }) => (
            <View style={styles.chipRow}>
              {EXERCISE_CATEGORIES.map((cat) => {
                const isActive = value === cat;
                const label = getCategoryLabel(cat);
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[chipStyles.chip, isActive && chipStyles.chipActive]}
                    onPress={() => onChange(cat)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isActive }}
                    accessibilityLabel={label}
                  >
                    <Text style={[chipStyles.chipText, isActive && chipStyles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        />
      </FormField>

      {/* プリセット種目では「記録する項目」も「フォームのポイント」も出さない。計測タイプは
          db/seed.tsが正で、変更しても次回起動時の差分検知で黙って戻されるため（「変えたのに
          戻っている」という原因不明のバグに見える）。フォームのポイントは詳細画面がgetGuide()の
          解説を出すため、保存しても表示されない「書き込み専用」状態になるのを避ける */}
      {!isPreset && (
        <>
        <FormField name="measurementType" label="記録する項目">
          <Controller
            control={control}
            name="measurementType"
            render={({ field: { value, onChange } }) => (
              <MeasurementTypeField value={value} onChange={onChange} />
            )}
          />
        </FormField>

        <FormField name="formPoints" label="フォームのポイント" optional>
          <Controller
            control={control}
            name="formPoints"
            render={({ field: { value, onChange } }) => (
              <View style={styles.pointList}>
                {value.map((point, index) => (
                  <View key={index} style={styles.pointRow}>
                    <Text style={styles.pointNumber}>{index + 1}</Text>
                    <BoxedTextInput
                      height={40}
                      boxStyle={[styles.inputBox, styles.pointBox]}
                      style={styles.inputText}
                      value={point}
                      onChangeText={(text) => {
                        const next = [...value];
                        next[index] = text;
                        onChange(next);
                      }}
                      placeholder="ポイントを入力"
                      accessibilityLabel={`フォームのポイント${index + 1}`}
                    />
                    <TouchableOpacity
                      style={styles.pointRemoveBtn}
                      onPress={() => onChange(value.filter((_, i) => i !== index))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={`ポイント${index + 1}を削除`}
                    >
                      <Text style={styles.pointRemoveBtnText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.pointAddBtn}
                  onPress={() => onChange([...value, ''])}
                  accessibilityLabel="ポイントを追加"
                >
                  <Text style={styles.pointAddBtnText}>＋ ポイントを追加</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </FormField>
        </>
      )}

      <FormField name="note" label="メモ" optional>
        <Controller
          control={control}
          name="note"
          render={({ field: { value, onChange } }) => (
            <TextInput
              style={styles.inputMultiline}
              value={value ?? ''}
              onChangeText={onChange}
              placeholder="メモ"
              multiline
              numberOfLines={2}
              accessibilityLabel="メモ"
            />
          )}
        />
      </FormField>

      <View style={styles.favoriteRow}>
        <FormLabel>お気に入りに追加</FormLabel>
        <Controller
          control={control}
          name="favorite"
          render={({ field: { value, onChange } }) => (
            <Switch
              value={value}
              onValueChange={onChange}
              accessibilityLabel="お気に入りに追加"
            />
          )}
        />
      </View>
    </FormFieldStack>
  );
});

const styles = StyleSheet.create({
  // 種目名・フォームのポイントは箱(枠線・背景・角丸・横padding)とTextInput本体を
  // BoxedTextInputで分離している。border/borderColor/borderRadius/文字色は既定値の
  // ままなのでここではpaddingHorizontalの差分だけ持つ。詳細はcomponents/ui/boxed-text-input.tsxのコメント参照
  inputBox: { paddingHorizontal: 11 },
  inputText: Typography.body,
  pointBox: { flex: 1 },

  // メモ欄は複数行で伸びる仕様のためBoxedTextInputを使わず、そのままの高さ可変で表示する
  inputMultiline: {
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    minHeight: 56,
    paddingHorizontal: 11,
    paddingVertical: 9,
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    textAlignVertical: 'top',
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  pointList: { gap: 8 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accent,
    color: Colors.onAccent,
    ...Typography.badge,
    lineHeight: 22,
    textAlign: 'center',
  },
  pointRemoveBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointRemoveBtnText: { fontSize: 16, color: Colors.textPlaceholder },
  pointAddBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentSurface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pointAddBtnText: { ...Typography.footnote, fontWeight: '600', color: Colors.accent },

  favoriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
});
