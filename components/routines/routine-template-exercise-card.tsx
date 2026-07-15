import { CategoryChip } from '@/components/exercises/category-chip';
import { ExerciseCardMenu } from '@/components/exercises/exercise-card-menu';
import { RoutineTemplateSetRow, type RoutineTemplateSetRowHandle } from '@/components/routines/routine-template-set-row';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import { getExerciseImages } from '@/lib/exercises/images';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';
import { MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import { Image } from 'expo-image';
import { forwardRef, memo, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Alert, LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  exercise: DraftExercise;
  // ドラフトストアのexercises配列内での位置。updateExerciseSets/removeExerciseAtの引数に使う
  index: number;
  isFirst: boolean;
  isLast: boolean;
  // この種目に「過去の記録から読み込む」で読み込める実績が1件でもあるか(session-exercise-card.tsxと
  // 同じ考え方だが、ルーティンには「進行中セッション」の概念が無いため除外対象は無い)
  hasHistory: boolean;
};

export type RoutineTemplateExerciseCardHandle = { focusFirstSet: () => void };

// 値が1つも無いセット行(空欄のまま追加しただけ等)は「入力済みの内容」として扱わない。
// トレーニング中画面(lib/workout/set-values.tsのhasAnyValue)と同じ判定だが、こちらはDBの行
// (setNumber等を持つPreviousSetValues)ではなく下書きのDraftExercise['sets']が対象のため別関数にする
function hasAnyDraftSetValue(s: DraftExercise['sets'][number]): boolean {
  return s.weight != null || s.reps != null || s.durationSeconds != null || s.distanceMeters != null;
}

// テンプレートセット編集画面（app/routine/exercise-edit.tsx）の種目1件分のカード。
// トレーニング中画面のSessionExerciseCardと構造・⋮メニュー(ExerciseCardMenu共通コンポーネント)は
// 同じだが、各項目の実処理はDBではなく下書き配列(useRoutineDraftStore)を直接書き換える
export const RoutineTemplateExerciseCard = memo(
  forwardRef<RoutineTemplateExerciseCardHandle, Props>(function RoutineTemplateExerciseCard(
    { exercise, index, isFirst, isLast, hasHistory }: Props,
    ref,
  ) {
  const images = getExerciseImages(exercise);
  const measurementType = resolveMeasurementType(exercise.measurementType);
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const updateExerciseSets = useRoutineDraftStore((state) => state.updateExerciseSets);
  const removeExerciseAt = useRoutineDraftStore((state) => state.removeExerciseAt);
  const moveExerciseAt = useRoutineDraftStore((state) => state.moveExerciseAt);
  const lastSetsReplacement = useRoutineDraftStore((state) => state.lastSetsReplacement);
  const pushDebounced = useDebouncedPush();
  const [collapsed, setCollapsed] = useState(false);
  const expanded = !collapsed;
  const sets = exercise.sets;

  // 種目追加ピッカー・過去の記録から読み込む直後、この画面(app/routine/exercise-edit.tsx)から
  // 「最初のセットの重量入力欄にフォーカスして欲しい」という指示を受けて実際にフォーカスする
  // (session-exercise-card.tsxのSessionExerciseCardHandleと同じ考え方)
  const firstSetRowRef = useRef<RoutineTemplateSetRowHandle>(null);
  useImperativeHandle(ref, () => ({ focusFirstSet: () => firstSetRowRef.current?.focus() }), []);

  // DraftExercise['sets']の各セットにはDBの行idのような安定した識別子が無く、配列内の
  // 位置しか手がかりが無い。行ごとの✕削除（末尾に限らず任意のindexを取り除ける）を
  // 配列indexそのものをkeyにして描画すると、削除後に詰まった行のReactインスタンスが
  // 使い回され、RoutineTemplateSetRowが内部stateとして保持する表示値（マウント時にしか
  // propsから取り込まない）が古いまま残ってしまう（＝別のセットの値が表示され続けるバグ）。
  // このカードの操作（追加・削除）でしかsetsの長さは変わらないため、その操作と同じ箇所で
  // 発番済みのローカルkey配列を追従させることで、React側の同一性をsetsの中身と正しく対応させる
  const nextRowKeyRef = useRef(0);
  const [rowKeys, setRowKeys] = useState<number[]>(() => sets.map(() => nextRowKeyRef.current++));

  // 「過去の記録から読み込む」はこのカードの追加/削除/値編集ハンドラを経由せず、別画面から
  // 直接setsを丸ごと差し替える。上記rowKeysの前提(このカードの操作でしか長さ・中身は変わらない)
  // が崩れるケースのため、lastSetsReplacementで自分のindex宛ての差し替えを検知したらrowKeysを
  // 総入れ替えし、既存のRoutineTemplateSetRowインスタンス(≒古い表示値)を全行分再マウントさせる
  const lastHandledReplacementTokenRef = useRef<number | null>(null);
  if (
    lastSetsReplacement != null &&
    lastSetsReplacement.index === index &&
    lastSetsReplacement.token !== lastHandledReplacementTokenRef.current
  ) {
    lastHandledReplacementTokenRef.current = lastSetsReplacement.token;
    setRowKeys(sets.map(() => nextRowKeyRef.current++));
  }

  const handleToggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((c) => !c);
  }, []);

  const handlePressInfo = useCallback(() => {
    pushDebounced(`/exercise/${exercise.exerciseId}`);
  }, [pushDebounced, exercise.exerciseId]);

  const handleSetChange = useCallback(
    (setIndex: number, values: DraftExercise['sets'][number]) => {
      updateExerciseSets(index, sets.map((s, i) => (i === setIndex ? values : s)));
    },
    [updateExerciseSets, index, sets],
  );

  const handleDeleteSet = useCallback(
    (setIndex: number) => {
      updateExerciseSets(index, sets.filter((_, i) => i !== setIndex));
      setRowKeys((keys) => keys.filter((_, i) => i !== setIndex));
    },
    [updateExerciseSets, index, sets],
  );

  const handleAddSet = useCallback(() => {
    // トレーニング中画面のhandleAddSet（session-exercise-card.tsx）が直前セットの値をコピーする
    // のと挙動を揃える。同じ重量で複数セットを組むテンプレートが多いため、空欄より前回値コピーの方が
    // 実用上望ましい。直前セットが無ければ（0セットの状態から追加）空欄で始める
    const last = sets[sets.length - 1];
    updateExerciseSets(index, [...sets, last ? { ...last } : { weight: null, reps: null, durationSeconds: null, distanceMeters: null }]);
    setRowKeys((keys) => [...keys, nextRowKeyRef.current++]);
  }, [updateExerciseSets, index, sets]);

  const handleDeleteLastSet = useCallback(() => {
    updateExerciseSets(index, sets.slice(0, -1));
    setRowKeys((keys) => keys.slice(0, -1));
  }, [updateExerciseSets, index, sets]);

  const handleDeleteExercise = useCallback(() => {
    Alert.alert('この種目をルーティンから削除しますか？', '設定したセットの内容も削除されます。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => removeExerciseAt(index) },
    ]);
  }, [removeExerciseAt, index]);

  const handleMoveUp = useCallback(() => moveExerciseAt(index, 'up'), [moveExerciseAt, index]);
  const handleMoveDown = useCallback(() => moveExerciseAt(index, 'down'), [moveExerciseAt, index]);

  const handleSwapExercise = useCallback(() => {
    // 入れ替え確定時に既存のセット内容が失われることの確認要否を、入れ替え画面側で
    // 判断できるよう渡しておく(session-exercise-card.tsxのhandleSwapExerciseと同じ考え方だが、
    // ルーティンには✓確定の概念が無いため「値が1つでも入っているか」で判定する)
    const hasRecordedData = sets.some(hasAnyDraftSetValue);
    pushDebounced({
      pathname: '/routine/exercise-swap',
      params: {
        index: String(index),
        currentExerciseId: String(exercise.exerciseId),
        currentExerciseName: exercise.name,
        hasRecordedData: hasRecordedData ? 'true' : 'false',
      },
    });
  }, [pushDebounced, index, exercise.exerciseId, exercise.name, sets]);

  const handleLoadFromHistory = useCallback(() => {
    const hasRecordedData = sets.some(hasAnyDraftSetValue);
    pushDebounced({
      pathname: '/routine/history-picker',
      params: {
        index: String(index),
        exerciseId: String(exercise.exerciseId),
        exerciseName: exercise.name,
        hasRecordedData: hasRecordedData ? 'true' : 'false',
      },
    });
  }, [pushDebounced, index, exercise.exerciseId, exercise.name, sets]);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={[styles.header, !expanded && styles.headerCollapsed]}
        onPress={handleToggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={expanded ? `${exercise.name}を折りたたむ` : `${exercise.name}、${sets.length}セット、展開する`}
        accessibilityState={{ expanded }}
      >
        <Image source={images.thumbnail} style={styles.thumbnail} contentFit="cover" />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {exercise.name}
          </Text>
          <CategoryChip category={exercise.category} />
        </View>
        <View style={styles.trailing}>
          <TouchableOpacity
            onPress={handlePressInfo}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel={`${exercise.name}の詳細を見る`}
          >
            <IconSymbol name="info.circle" size={20} color={Colors.textPlaceholder} />
          </TouchableOpacity>
          {expanded && (
            <ExerciseCardMenu
              isFirst={isFirst}
              isLast={isLast}
              onSwap={handleSwapExercise}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onLoadFromHistory={handleLoadFromHistory}
              hasHistory={hasHistory}
              onDelete={handleDeleteExercise}
            />
          )}
          {!expanded && (
            <View style={styles.collapsedSummary}>
              <Text style={styles.collapsedSummaryText}>{sets.length}セット</Text>
              <IconSymbol name="chevron.right" size={14} color={Colors.textPlaceholder} style={styles.collapsedChevron} />
            </View>
          )}
        </View>
      </TouchableOpacity>

      <View testID="card-body" style={[styles.body, !expanded && styles.bodyHidden]}>
        <View style={styles.columnHeader}>
          <Text style={styles.numberLabel}>セット</Text>
          {columns.map((c) => (
            <Text key={c.key} style={styles.columnLabel}>
              {c.label}
            </Text>
          ))}
          <View style={styles.deleteSpacer} />
        </View>

        {sets.map((s, setIndex) => (
          <RoutineTemplateSetRow
            key={rowKeys[setIndex]}
            ref={setIndex === 0 ? firstSetRowRef : undefined}
            setNumber={setIndex + 1}
            values={s}
            measurementType={measurementType}
            exerciseName={exercise.name}
            onChange={(values) => handleSetChange(setIndex, values)}
            onDelete={() => handleDeleteSet(setIndex)}
          />
        ))}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleDeleteLastSet}
            disabled={sets.length === 0}
            accessibilityRole="button"
            accessibilityLabel="セット削除"
            accessibilityState={{ disabled: sets.length === 0 }}
          >
            <IconSymbol name="xmark" size={17} color={sets.length === 0 ? Colors.textPlaceholder : Colors.danger} />
            <Text style={[styles.actionText, { color: sets.length === 0 ? Colors.textPlaceholder : Colors.danger }]}>
              セット削除
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleAddSet} accessibilityRole="button" accessibilityLabel="セット追加">
            <IconSymbol name="plus" size={17} color={Colors.accent} />
            <Text style={[styles.actionText, { color: Colors.accent }]}>セット追加</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
    );
  }),
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerCollapsed: { borderBottomWidth: 0 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  collapsedSummary: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  collapsedSummaryText: { ...Typography.footnote, fontWeight: '600', color: Colors.textPlaceholder },
  collapsedChevron: { transform: [{ rotate: '90deg' }] },
  thumbnail: {
    width: 46,
    height: 46,
    borderRadius: 7,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  info: { flex: 1, gap: 3 },
  name: { ...Typography.cardTitle, color: Colors.textPrimary },

  body: { padding: 10 },
  bodyHidden: { display: 'none' },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 6 },
  numberLabel: { width: 52, textAlign: 'center', ...Typography.caption, fontWeight: '600', color: Colors.textPlaceholder },
  deleteSpacer: { width: 24 },
  columnLabel: { flex: 1, textAlign: 'center', ...Typography.caption, fontWeight: '600', color: Colors.textPlaceholder },

  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    paddingVertical: 12,
  },
  actionText: { ...Typography.footnote, fontWeight: '600' },
});
