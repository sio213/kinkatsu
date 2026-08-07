import { RoutineDiffExerciseRow } from '@/components/routines/routine-diff-exercise-row';
import { CheckboxSelectHeader } from '@/components/ui/checkbox-select-header';
import { HeaderTitle } from '@/components/ui/header-title';
import { NotFoundState } from '@/components/ui/not-found-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenFooter } from '@/components/ui/screen-footer';
import { Colors, ScreenStyles, Typography } from '@/constants/theme';
import { useRoutineDiff } from '@/hooks/use-routine-diff';
import { getRoutineDetail, updateRoutine } from '@/lib/routines/db';
import { applyRoutineDiff, diffTotalCount, type DiffExercise, type DiffSelection } from '@/lib/routines/diff';
import { useRoutineUpdatePromptStore } from '@/lib/workout/routine-update-prompt-store';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Section = { title: string; exercises: DiffExercise[] };

/**
 * ルーティンを更新 — 差分確認画面（デザイン案④ V14c）。
 *
 * ルーティンのテンプレートと今日の実績の差分を種目単位で並べ、チェックしたものだけを反映する。
 * **確定ボタンを押すまでルーティンは一切変わらない。**
 *
 * 既定チェックは 追加=ON / 値の変更=ON / 未実施=OFF。未実施だけ既定オフなのは、
 * その日やらなかっただけの種目を型から消すのが多くの場合やってほしくない操作だから。
 * 下がった値も一律ONにするのは、確認画面まで来た人は「更新しに来ている」ため
 * （個々の値は行の「ルーティン → 今日」で確認できる）。
 */
export default function RoutineUpdateScreen() {
  const { id, sessionId: sessionIdParam } = useLocalSearchParams<{ id: string; sessionId: string }>();
  const routineId = Number(id);
  const sessionId = Number(sessionIdParam);
  const router = useRouter();
  const restorePrompt = useRoutineUpdatePromptStore((state) => state.restore);

  const { diff, routineName, retry } = useRoutineDiff(
    Number.isFinite(sessionId) ? sessionId : null,
    Number.isFinite(routineId) ? routineId : null,
  );

  const [selectionState, setSelectionState] = useState<{ key: string; value: DiffSelection } | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const isSubmittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const resolved = diff !== null && diff !== 'error' ? diff : null;

  const sections: Section[] = useMemo(() => {
    if (!resolved) return [];
    return [
      { title: '追加した種目', exercises: resolved.added },
      { title: '値の変更', exercises: resolved.changed },
      { title: '未実施の種目（チェックで削除）', exercises: resolved.removed },
    ].filter((s) => s.exercises.length > 0);
  }, [resolved]);

  const allKeys = useMemo(
    () => (resolved ? [...resolved.added, ...resolved.changed, ...resolved.removed].map((e) => e.key) : []),
    [resolved],
  );

  // 既定チェックは「行の顔ぶれ」から導出する。effectでstateに書くと、差分が解決した最初の
  // 1フレームだけ全項目未チェック・更新ボタン無効という別の状態が描かれてしまう。
  // 顔ぶれが変わらない再取得（画面に戻ったとき）ではユーザーの選択がそのまま残る
  const diffKey = allKeys.join('|');
  const selection: DiffSelection = useMemo(() => {
    if (selectionState?.key === diffKey) return selectionState.value;
    const defaults = new Set<string>();
    for (const e of resolved?.added ?? []) defaults.add(e.key);
    for (const e of resolved?.changed ?? []) defaults.add(e.key);
    return { exercises: defaults, sets: new Map() };
  }, [selectionState, diffKey, resolved]);

  const allSelected = allKeys.length > 0 && selection.exercises.size === allKeys.length;

  const updateSelection = (next: DiffSelection) => setSelectionState({ key: diffKey, value: next });

  // 種目のチェックはその種目のセットにも波及させる。ONなら全セットON（＝Mapから消す。
  // 未登録は全セットONの意味）、OFFなら全セットOFF。
  // 親がOFFのとき反映結果はどのみちルーティンのままだが、開いた状態で子だけ付いたままだと
  // 「何が反映されるのか」が読めなくなる
  const handleToggleExercise = (key: string) => {
    const exercises = new Set(selection.exercises);
    const sets = new Map(selection.sets);
    if (exercises.has(key)) {
      exercises.delete(key);
      sets.set(key, new Set());
    } else {
      exercises.add(key);
      sets.delete(key);
    }
    updateSelection({ exercises, sets });
  };

  const handleToggleAll = () => {
    const turningOff = selection.exercises.size === allKeys.length;
    updateSelection({
      exercises: turningOff ? new Set() : new Set(allKeys),
      // 全選択も同じく子まで波及させる
      sets: turningOff ? new Map((resolved?.changed ?? []).map((e) => [e.key, new Set<number>()])) : new Map(),
    });
  };

  // セット単位のチェック。Map未登録＝全セットONなので、初回のトグルでは
  // 「全セット」から対象を1つ外した集合を作る。
  // 親への逆連動も同時に行う——全部外れたら親も外し、全部付いたら親を付ける。
  // 親だけ付いたまま子が全部外れていると、確定しても何も変わらない（no-op）操作になる
  const handleToggleSet = (key: string, setNumber: number) => {
    const exercise = resolved?.changed.find((e) => e.key === key);
    if (!exercise) return;
    const sets = new Map(selection.sets);
    const current = sets.get(key) ?? new Set(exercise.setDiffs.map((d) => d.setNumber));
    const next = new Set(current);
    if (next.has(setNumber)) next.delete(setNumber);
    else next.add(setNumber);
    sets.set(key, next);

    const exercises = new Set(selection.exercises);
    if (next.size === 0) exercises.delete(key);
    else exercises.add(key);

    updateSelection({ exercises, sets });
  };

  // 一部のセットだけ外れている状態（親のチェックボックスを横棒にする）
  const isPartiallySelected = (exercise: DiffExercise) => {
    if (exercise.kind !== 'changed' || !selection.exercises.has(exercise.key)) return false;
    const accepted = selection.sets.get(exercise.key);
    return accepted != null && accepted.size > 0 && accepted.size < exercise.setDiffs.length;
  };

  const handleToggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!resolved || selection.exercises.size === 0) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      // 名前・リマインダーには触らない。updateRoutineはreminderPlanを省略すると
      // リマインダーを更新しない（lib/routines/db.ts参照）
      const detail = await getRoutineDetail(routineId);
      if (!detail) throw new Error(`routine not found: ${routineId}`);
      // updateRoutineはroutineExercisesを全削除・再挿入するため、他画面でこのルーティンが
      // 保存されているとidが総入れ替えになり、差分のkey（routine:<id>）と一致しなくなる。
      // 気づかずに書くと「何も反映されないまま閉じる」という一番静かな失敗になるので、
      // 差分を取り直させる（@reviewer指摘）
      const knownIds = new Set(detail.exercises.map((e) => `routine:${e.id}`));
      const stale = [...resolved.changed, ...resolved.removed].some((e) => !knownIds.has(e.key));
      if (stale) {
        Alert.alert('ルーティンが変更されました', 'もう一度内容を確認してください。');
        retry();
        return;
      }
      const exercises = applyRoutineDiff(detail.exercises, resolved, selection);
      await updateRoutine(routineId, { name: detail.routine.name, exercises });
      // 「今後表示しない」は「同期しない」という表明なので、実際に更新したなら撤回したと読む
      restorePrompt();
      router.back();
    } catch (e) {
      console.error('[routine update]', e);
      Alert.alert('エラー', 'ルーティンを更新できませんでした。');
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const screenOptions = {
    headerTitle: () => <HeaderTitle title="ルーティンを更新" subtitle={routineName ?? ''} />,
  };

  if (!Number.isFinite(routineId) || !Number.isFinite(sessionId) || diff === 'error') {
    return (
      <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
        <Stack.Screen options={screenOptions} />
        <NotFoundState message="差分を読み込めませんでした" actionLabel="再試行" onPressAction={retry} />
      </SafeAreaView>
    );
  }

  if (!resolved) {
    return (
      <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // 差分ゼロ。直リンクや、開いている間に記録が編集された場合に到達しうる。
  // 押せない確定ボタンは置かず「閉じる」だけにする（デザイン案の0差分状態）
  if (diffTotalCount(resolved) === 0) {
    return (
      <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
        <Stack.Screen options={screenOptions} />
        <NotFoundState
          message="ルーティン通りでした。更新するものはありません"
          actionLabel="閉じる"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <Stack.Screen options={screenOptions} />

      <CheckboxSelectHeader
        variant="selection"
        itemLabel="種目"
        selectedCount={selection.exercises.size}
        totalCount={allKeys.length}
        allSelected={allSelected}
        onToggleAll={handleToggleAll}
      />

      <ScrollView style={styles.list} contentContainerStyle={styles.content}>
        {sections.map((section) => (
          <View key={section.title}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{`${section.exercises.length}件`}</Text>
            </View>
            {section.exercises.map((exercise) => (
              <RoutineDiffExerciseRow
                key={exercise.key}
                exercise={exercise}
                selection={selection}
                partiallySelected={isPartiallySelected(exercise)}
                expanded={expandedKeys.has(exercise.key)}
                onToggleExercise={handleToggleExercise}
                onToggleSet={handleToggleSet}
                onToggleExpanded={handleToggleExpanded}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      <ScreenFooter>
        <PrimaryButton
          label="更新する"
          onPress={handleSubmit}
          disabled={selection.exercises.size === 0 || submitting}
        />
      </ScreenFooter>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  content: { paddingBottom: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: { ...Typography.footnote, fontWeight: '600', color: Colors.textSecondary, flex: 1 },
  sectionCount: { ...Typography.footnote, color: Colors.textMuted },
});
