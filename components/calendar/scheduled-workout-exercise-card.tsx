import { ExerciseCardMenu } from '@/components/exercises/exercise-card-menu';
import { ExerciseIdentity } from '@/components/exercises/exercise-identity';
import { ScheduledWorkoutSetRow } from '@/components/calendar/scheduled-workout-set-row';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import type { ScheduledWorkoutExerciseDetail } from '@/hooks/use-scheduled-workout-exercises';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import { getExerciseImages } from '@/lib/exercises/images';
import {
  addScheduledWorkoutSet,
  deleteLastScheduledWorkoutSet,
  deleteScheduledWorkoutSet,
} from '@/lib/calendar/scheduled-workout-detail';
import { MEASUREMENT_COLUMNS, summarizeExerciseSets } from '@/lib/workout/set-format';
import { memo, useCallback, useState } from 'react';
import { Alert, LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  exercise: ScheduledWorkoutExerciseDetail;
  isFirst: boolean;
  isLast: boolean;
  onSwap: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

// 直接予定の種目編集画面(app/calendar/schedule-workout-edit.tsx)の種目1件分のカード。
// components/routines/routine-template-exercise-card.tsxと構造は同じだが、下書き配列ではなく
// 実DB（lib/calendar/scheduled-workout-detail.ts）へ都度書き込む。⋮メニューはルーティン版と
// 同じcomponents/exercises/exercise-card-menu.tsxを共有し、「過去の記録から読み込み」だけ省略する
// （onLoadFromHistoryを渡さない＝この予定自体が既に実データでルーティンほど読み込み元が無いため）
export const ScheduledWorkoutExerciseCard = memo(function ScheduledWorkoutExerciseCard({
  exercise,
  isFirst,
  isLast,
  onSwap,
  onDelete,
  onMoveUp,
  onMoveDown,
}: Props) {
  const images = getExerciseImages(exercise);
  const measurementType = resolveMeasurementType(exercise.measurementType);
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const pushDebounced = useDebouncedPush();
  const [collapsed, setCollapsed] = useState(false);
  const expanded = !collapsed;
  const sets = exercise.sets;

  const handleToggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((c) => !c);
  }, []);

  const handlePressInfo = useCallback(() => {
    pushDebounced(`/exercise/${exercise.exerciseId}`);
  }, [pushDebounced, exercise.exerciseId]);

  const handleAddSet = useCallback(async () => {
    try {
      await addScheduledWorkoutSet(exercise.scheduledWorkoutExerciseId);
    } catch (e) {
      console.error('[scheduled workout add set]', e);
      Alert.alert('エラー', 'セットを追加できませんでした。');
    }
  }, [exercise.scheduledWorkoutExerciseId]);

  const handleDeleteLastSet = useCallback(async () => {
    try {
      await deleteLastScheduledWorkoutSet(exercise.scheduledWorkoutExerciseId);
    } catch (e) {
      console.error('[scheduled workout delete last set]', e);
      Alert.alert('エラー', 'セットを削除できませんでした。');
    }
  }, [exercise.scheduledWorkoutExerciseId]);

  const handleDeleteSet = useCallback(async (setId: number) => {
    try {
      await deleteScheduledWorkoutSet(setId);
    } catch (e) {
      console.error('[scheduled workout delete set]', e);
      Alert.alert('エラー', 'セットを削除できませんでした。');
    }
  }, []);

  const collapsedSummary = summarizeExerciseSets(measurementType, sets);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={[styles.header, !expanded && styles.headerCollapsed]}
        onPress={handleToggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={expanded ? `${exercise.name}を折りたたむ` : `${exercise.name}、${collapsedSummary}、展開する`}
        accessibilityState={{ expanded }}
      >
        <ExerciseIdentity
          images={images}
          name={exercise.name}
          category={exercise.category}
          metaTrailing={
            !expanded && (
              <Text style={styles.collapsedSummaryText} numberOfLines={1}>
                {collapsedSummary}
              </Text>
            )
          }
        />
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
              onSwap={onSwap}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onDelete={onDelete}
            />
          )}
          {!expanded && (
            <IconSymbol name="chevron.right" size={14} color={Colors.textPlaceholder} style={styles.collapsedChevron} />
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
          <ScheduledWorkoutSetRow
            key={s.id}
            set={s}
            setNumber={setIndex + 1}
            measurementType={measurementType}
            exerciseName={exercise.name}
            onDelete={() => handleDeleteSet(s.id)}
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
  collapsedSummaryText: { ...Typography.footnote, fontWeight: '600', color: Colors.textMuted, flexShrink: 1 },
  collapsedChevron: { transform: [{ rotate: '90deg' }] },

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
