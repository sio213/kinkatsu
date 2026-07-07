import { CategoryChip } from '@/components/exercises/category-chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import type { Set } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import type { SessionExercise } from '@/hooks/use-workout-session';
import { MEASUREMENT_TYPES, type MeasurementType } from '@/lib/exercises/constants';
import { getExerciseImages } from '@/lib/exercises/images';
import { removeExerciseFromSession, swapExerciseOrder } from '@/lib/workout/session';
import { MEASUREMENT_COLUMNS, parseColumnsWithFallback } from '@/lib/workout/set-format';
import { addSet, deleteLastSet, reopenSet, saveDraft, saveSet, type SetValues } from '@/lib/workout/sets';
import { Image } from 'expo-image';
import { forwardRef, memo, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Alert, LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ExerciseCardMenu } from './exercise-card-menu';
import { SetRow, type SetRowHandle } from './set-row';

type Props = {
  exercise: SessionExercise;
  sessionId: number;
  sets: Set[];
  collapsed: boolean;
  isFirst: boolean;
  isLast: boolean;
  // 隣接するworkoutSessionExercises行のid。上へ移動/下へ移動でorderIndexを入れ替える相手
  previousSessionExerciseId: number | null;
  nextSessionExerciseId: number | null;
  onToggleCollapsed: (sessionExerciseId: number) => void;
  // 種目追加/入れ替え時に前回の記録から実際に値をコピーして挿入したセットのid一覧
  // （lib/workout/session.tsのPrefilledCard.prefilledSetIds）。この行idに含まれるSetRowだけ
  // ゴースト表示にする
  prefilledSetIds: number[];
  // この種目に「過去の記録から読み込む」で読み込める過去記録が1件でもあるか。無ければ
  // ⋮メニューの当該項目を「上へ移動」等と同じくグレーアウトする
  hasHistory: boolean;
};

export type SessionExerciseCardHandle = { focusFirstSet: () => void };

export const SessionExerciseCard = memo(
  forwardRef<SessionExerciseCardHandle, Props>(function SessionExerciseCard(
    {
      exercise,
      sessionId,
      sets,
      collapsed,
      isFirst,
      isLast,
      previousSessionExerciseId,
      nextSessionExerciseId,
      onToggleCollapsed,
      prefilledSetIds,
      hasHistory,
    }: Props,
    ref,
  ) {
  const images = getExerciseImages(exercise);
  // 未知のmeasurementType（想定外のDB値）でも画面ごとクラッシュさせず標準の重量×回数にフォールバックする
  const measurementType: MeasurementType = (
    MEASUREMENT_TYPES as readonly string[]
  ).includes(exercise.measurementType)
    ? (exercise.measurementType as MeasurementType)
    : 'weight_reps';
  const columns = MEASUREMENT_COLUMNS[measurementType];
  const isMutatingRef = useRef(false);
  const pushDebounced = useDebouncedPush();
  const expanded = !collapsed;
  // ✓未タップのまま入力中のセット値（setId→表示文字列）。DBにはまだ保存されていないため、
  // 「セット追加」時にこれをコピー元として使えるようにする。re-renderは不要なのでrefで持つ
  const draftValuesRef = useRef<Map<number, Record<string, string>>>(new Map());
  // 先頭セット行のref。種目追加直後、画面遷移が完了してから親（workout/[id].tsx）が
  // focusFirstSet()を呼び、その入力欄へ実際にフォーカスする（RN標準動作でキーボード上に
  // 自動スクロールされる）。宣言的なautoFocsuプロパティは画面遷移アニメーション中に
  // キーボードが被さって出るタイミング問題があるため使わない（app/exercise/new.tsxと同じ方針）
  const firstSetRowRef = useRef<SetRowHandle>(null);
  useImperativeHandle(ref, () => ({ focusFirstSet: () => firstSetRowRef.current?.focus() }), []);

  // カード内のいずれかのセットが一度でも✓確定されたら（reopenで未確定に戻っても）trueのまま
  // ラッチする。1セットでも確定したら「もう見た」とみなし、このカードの残りのゴースト行も
  // 含めて全部通常色に戻すため（set-row.tsx側でこの値を使ってghostを計算する）
  const hasConfirmedNow = sets.some((s) => s.completedAt != null);
  const cardReviewedRef = useRef(hasConfirmedNow);
  if (hasConfirmedNow) cardReviewedRef.current = true;
  // ✓確定だけでなく、カード内のどれか1つでも値を編集したら「もう見た」扱いにして欲しいという
  // 要望のため、onDraftChange（1文字入力するたびに全SetRowから呼ばれる）でも同様にラッチする。
  // 既にtrueの間は同じ値でsetStateしてもReactが再レンダーをスキップするため、キー入力のたびに
  // 無駄な再レンダーが起きるわけではない
  const [anyEditedInCard, setAnyEditedInCard] = useState(false);
  const cardReviewed = cardReviewedRef.current || anyEditedInCard;

  const handleDraftChange = useCallback((setId: number, values: Record<string, string>) => {
    draftValuesRef.current.set(setId, values);
    setAnyEditedInCard(true);
  }, []);

  // 1文字入力するたびに呼ばれるバックグラウンド保存。ここでAlertを出すと入力中に
  // 何度もポップアップが出てしまうため、失敗時はログのみに留める（最終的な保存は
  // ✓タップ時のhandleSaveSetがAlert付きで担保する）
  const handleAutoSaveDraft = useCallback(async (setId: number, values: SetValues) => {
    try {
      await saveDraft(setId, values);
    } catch (e) {
      console.error('[auto save draft]', e);
    }
  }, []);

  const handlePressInfo = useCallback(() => {
    pushDebounced(`/exercise/${exercise.id}`);
  }, [pushDebounced, exercise.id]);

  const handleSwapExercise = useCallback(() => {
    // 確認ダイアログの要否をexercise-swap画面側で判断できるよう、既に何か記録済みか
    // （✓確定済みかどうか）を渡しておく。前回セットのプリフィル（✓未タップ・値だけ入っている状態）は
    // ユーザーがまだ確認していないため「記録済み」に含めない（セット削除の確認要否と同じ考え方）
    const hasRecordedData = sets.some((s) => s.completedAt != null);
    pushDebounced({
      pathname: '/workout/exercise-swap',
      params: {
        sessionExerciseId: String(exercise.sessionExerciseId),
        currentExerciseId: String(exercise.id),
        currentExerciseName: exercise.name,
        hasRecordedData: hasRecordedData ? 'true' : 'false',
      },
    });
  }, [pushDebounced, exercise.sessionExerciseId, exercise.id, exercise.name, sets]);

  const handleLoadFromHistory = useCallback(() => {
    pushDebounced({
      pathname: '/workout/history-picker',
      params: {
        sessionId: String(sessionId),
        sessionExerciseId: String(exercise.sessionExerciseId),
        exerciseId: String(exercise.id),
        exerciseName: exercise.name,
      },
    });
  }, [pushDebounced, sessionId, exercise.sessionExerciseId, exercise.id, exercise.name]);

  const handleToggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleCollapsed(exercise.sessionExerciseId);
  }, [onToggleCollapsed, exercise.sessionExerciseId]);

  const handleAddSet = useCallback(async () => {
    if (isMutatingRef.current) return;
    isMutatingRef.current = true;
    try {
      // 直前のセットが✓未タップ（completedAt: null）の場合、DBにはまだ値が保存されていないため、
      // 画面上の入力途中の値（draft）があればそれをコピー元にする。✓タップ済みならDB上の
      // 確定値がそのままコピー元になるので、addSet側の既定動作（overrideValues省略）に任せる。
      // draftの一部の列が不正な入力（"60kg"等）でパースできない場合は、黙ってnullにはせず
      // その列だけDB上のlast（直前セットの既存値）にフォールバックする
      const last = sets[sets.length - 1];
      let overrideValues: SetValues | undefined;
      if (last && last.completedAt == null) {
        const draft = draftValuesRef.current.get(last.id);
        if (draft) {
          overrideValues = parseColumnsWithFallback(columns, draft, last);
        }
      }
      await addSet(sessionId, exercise.id, exercise.sessionExerciseId, overrideValues);
    } catch (e) {
      console.error('[add set]', e);
      Alert.alert('エラー', 'セットを追加できませんでした。');
    } finally {
      isMutatingRef.current = false;
    }
  }, [sessionId, exercise.id, exercise.sessionExerciseId, sets, columns]);

  const runDeleteLastSet = useCallback(async () => {
    if (isMutatingRef.current) return;
    isMutatingRef.current = true;
    try {
      const last = sets[sets.length - 1];
      await deleteLastSet(exercise.sessionExerciseId);
      // 削除したセットのdraftは二度と参照されないため、Mapに積み上がらないよう掃除しておく
      if (last) draftValuesRef.current.delete(last.id);
    } catch (e) {
      console.error('[delete set]', e);
      Alert.alert('エラー', 'セットを削除できませんでした。');
    } finally {
      isMutatingRef.current = false;
    }
  }, [exercise.sessionExerciseId, sets]);

  const handleDeleteSet = useCallback(() => {
    const last = sets[sets.length - 1];
    // 値が入っている（チェック済みの）セットを消す場合だけ確認する。空のセットの削除は毎回確認すると
    // かえって煩わしいため確認なしで即削除してよい
    if (last?.completedAt != null) {
      Alert.alert('このセットを削除しますか？', '入力した記録が失われます。', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: runDeleteLastSet },
      ]);
      return;
    }
    runDeleteLastSet();
  }, [sets, runDeleteLastSet]);

  const handleSaveSet = useCallback(async (setId: number, values: SetValues) => {
    try {
      await saveSet(setId, values);
      // 確定後はhandleAddSetがこのセットのdraftを参照しなくなるため、Mapに積み上がらないよう掃除する
      draftValuesRef.current.delete(setId);
    } catch (e) {
      console.error('[save set]', e);
      Alert.alert('エラー', 'セットを保存できませんでした。');
    }
  }, []);

  const handleReopenSet = useCallback(async (setId: number) => {
    try {
      await reopenSet(setId);
    } catch (e) {
      console.error('[reopen set]', e);
      Alert.alert('エラー', 'セットを編集状態に戻せませんでした。');
    }
  }, []);

  const handleMoveUp = useCallback(async () => {
    if (previousSessionExerciseId == null) return;
    try {
      await swapExerciseOrder(exercise.sessionExerciseId, previousSessionExerciseId);
    } catch (e) {
      console.error('[move exercise up]', e);
      Alert.alert('エラー', '種目を並び替えられませんでした。');
    }
  }, [exercise.sessionExerciseId, previousSessionExerciseId]);

  const handleMoveDown = useCallback(async () => {
    if (nextSessionExerciseId == null) return;
    try {
      await swapExerciseOrder(exercise.sessionExerciseId, nextSessionExerciseId);
    } catch (e) {
      console.error('[move exercise down]', e);
      Alert.alert('エラー', '種目を並び替えられませんでした。');
    }
  }, [exercise.sessionExerciseId, nextSessionExerciseId]);

  const handleDeleteExercise = useCallback(() => {
    Alert.alert('この種目を削除しますか？', '記録した内容も削除されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeExerciseFromSession(exercise.sessionExerciseId);
          } catch (e) {
            console.error('[delete exercise]', e);
            Alert.alert('エラー', '種目を削除できませんでした。');
          }
        },
      },
    ]);
  }, [exercise.sessionExerciseId]);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={[styles.header, !expanded && styles.headerCollapsed]}
        onPress={handleToggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? `${exercise.name}を折りたたむ` : `${exercise.name}、${sets.length}セット、展開する`
        }
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
              <IconSymbol
                name="chevron.right"
                size={14}
                color={Colors.textPlaceholder}
                style={styles.collapsedChevron}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* 折りたたみ時もアンマウントせずdisplay:noneで隠す。SetRowはローカルstateに未保存の入力値を
          持つため、アンマウントすると✓未タップの入力が消えてしまう */}
      <View testID="card-body" style={[styles.body, !expanded && styles.bodyHidden]}>
        <View style={styles.columnHeader}>
          <Text style={styles.numberLabel}>セット</Text>
          {columns.map((c) => (
            <Text key={c.key} style={styles.columnLabel}>
              {c.label}
            </Text>
          ))}
          <View style={styles.checkSpacer} />
        </View>

        {sets.map((s, index) => (
          <SetRow
            key={s.id}
            ref={index === 0 ? firstSetRowRef : undefined}
            set={s}
            exerciseName={exercise.name}
            measurementType={measurementType}
            onSave={handleSaveSet}
            onReopen={handleReopenSet}
            onDraftChange={handleDraftChange}
            onAutoSaveDraft={handleAutoSaveDraft}
            isPrefilledSet={prefilledSetIds.includes(s.id)}
            cardReviewed={cardReviewed}
          />
        ))}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleDeleteSet}
            disabled={sets.length === 0}
            accessibilityRole="button"
            accessibilityLabel="セット削除"
            accessibilityState={{ disabled: sets.length === 0 }}
          >
            <IconSymbol
              name="xmark"
              size={17}
              color={sets.length === 0 ? Colors.textPlaceholder : Colors.danger}
            />
            <Text
              style={[
                styles.actionText,
                { color: sets.length === 0 ? Colors.textPlaceholder : Colors.danger },
              ]}
            >
              セット削除
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleAddSet}
            accessibilityRole="button"
            accessibilityLabel="セット追加"
          >
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
  // 「Nセットのサマリー」と「ⓘボタン」を1つのグループにまとめ、gapで一定の余白を確保する。
  // header全体のgap(10)だけに頼ると、ⓘのhitSlop(14pt)と視覚的に密集して見えるため
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  collapsedSummary: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  collapsedSummaryText: { fontSize: 12.5, fontWeight: '600', color: Colors.textPlaceholder },
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
  name: { fontSize: 14.5, fontWeight: '700', color: Colors.textPrimary },

  body: { padding: 10 },
  bodyHidden: { display: 'none' },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 6 },
  numberLabel: {
    width: 32,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPlaceholder,
  },
  checkSpacer: { width: 24 },
  columnLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPlaceholder,
  },

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
  actionText: { fontWeight: '600', fontSize: 12.5 },
});
