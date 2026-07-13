import { CategoryChip } from '@/components/exercises/category-chip';
import { RoutineTemplateSetRow } from '@/components/routines/routine-template-set-row';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import { getExerciseImages } from '@/lib/exercises/images';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import type { DraftExercise } from '@/lib/routines/validation';
import { MEASUREMENT_COLUMNS } from '@/lib/workout/set-format';
import { Image } from 'expo-image';
import { memo, useCallback, useRef, useState } from 'react';
import { Alert, LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  exercise: DraftExercise;
  // ドラフトストアのexercises配列内での位置。updateExerciseSets/removeExerciseAtの引数に使う
  index: number;
};

// テンプレートセット編集画面（app/routine/exercise-edit.tsx）の種目1件分のカード。
// トレーニング中画面のSessionExerciseCardと似た構造(折りたたみ可能なヘッダー+セット表+
// 追加/削除ボタン)だが、種目の入れ替え・過去記録読み込みはセッション固有の機能のため持たず、
// 代わりに⋮メニューにこの画面が担う「種目をルーティンから削除」を持つ
export const RoutineTemplateExerciseCard = memo(function RoutineTemplateExerciseCard({ exercise, index }: Props) {
  const images = getExerciseImages(exercise);
  const measurementType = resolveMeasurementType(exercise.measurementType);
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const updateExerciseSets = useRoutineDraftStore((state) => state.updateExerciseSets);
  const removeExerciseAt = useRoutineDraftStore((state) => state.removeExerciseAt);
  const pushDebounced = useDebouncedPush();
  const [collapsed, setCollapsed] = useState(false);
  const expanded = !collapsed;
  const sets = exercise.sets;

  // DraftExercise['sets']の各セットにはDBの行idのような安定した識別子が無く、配列内の
  // 位置しか手がかりが無い。行ごとの✕削除（末尾に限らず任意のindexを取り除ける）を
  // 配列indexそのものをkeyにして描画すると、削除後に詰まった行のReactインスタンスが
  // 使い回され、RoutineTemplateSetRowが内部stateとして保持する表示値（マウント時にしか
  // propsから取り込まない）が古いまま残ってしまう（＝別のセットの値が表示され続けるバグ）。
  // このカードの操作（追加・削除）でしかsetsの長さは変わらないため、その操作と同じ箇所で
  // 発番済みのローカルkey配列を追従させることで、React側の同一性をsetsの中身と正しく対応させる
  const nextRowKeyRef = useRef(0);
  const [rowKeys, setRowKeys] = useState<number[]>(() => sets.map(() => nextRowKeyRef.current++));

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
            <DropdownMenu
              groups={[[{ key: 'delete', label: '削除', icon: 'delete-outline', danger: true, onPress: handleDeleteExercise }]]}
              minWidth={140}
              renderTrigger={({ open, onPress }) => (
                <TouchableOpacity
                  onPress={onPress}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  accessibilityRole="button"
                  accessibilityLabel="メニューを開く"
                  accessibilityState={{ expanded: open }}
                >
                  <IconSymbol name="ellipsis" size={20} color={open ? Colors.accent : Colors.textPlaceholder} />
                </TouchableOpacity>
              )}
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
});

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
