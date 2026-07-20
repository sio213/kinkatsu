import { ContextBar } from '@/components/ui/context-bar';
import { HeaderMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { HeaderTitle } from '@/components/ui/header-title';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { NotFoundState } from '@/components/ui/not-found-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { AddExerciseButton } from '@/components/workout/add-exercise-button';
import { SessionExerciseCard, type SessionExerciseCardHandle } from '@/components/workout/session-exercise-card';
import { Colors, Typography } from '@/constants/theme';
import { useAutoCollapseCompletedExercises } from '@/hooks/use-auto-collapse-completed-exercises';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useRoutines } from '@/hooks/use-routines';
import { useTickingNow } from '@/hooks/use-ticking-now';
import {
  EMPTY_PREFILLED_SET_IDS,
  EMPTY_SETS,
  useExercisesWithHistory,
  useSessionExercises,
  useSessionSetCount,
  useSessionSets,
  useWorkoutSession,
} from '@/hooks/use-workout-session';
import { subscribePrefilled } from '@/lib/workout/prefill-feedback';
import { deleteSession, endWorkoutSession, type PrefilledCard } from '@/lib/workout/session';
import { formatMinutesSeconds, formatSessionDateGroup, formatSessionDuration } from '@/lib/workout/summary';
import type { ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const parsedId = Number(id);
  const sessionId = Number.isFinite(parsedId) ? parsedId : null;
  const { session, loaded } = useWorkoutSession(sessionId ?? -1);
  const setCount = useSessionSetCount(sessionId ?? -1);
  const sessionExercises = useSessionExercises(sessionId ?? -1);
  const sessionSets = useSessionSets(sessionId ?? -1);
  const exercisesWithHistory = useExercisesWithHistory(sessionId ?? -1);
  const { routines } = useRoutines();
  const isFinishingRef = useRef(false);
  const keyboardInset = useKeyboardInset();
  // 種目追加/入れ替え/記録から読み込む画面はDB操作直後にrouter.back()で閉じるため、プリフィルが
  // 起きたことはpub/sub経由でここに届く（lib/workout/prefill-feedback.ts）。プリフィルされた
  // セットidが分かればカード内のゴースト表示に使える。カード（sessionExerciseId）単位のMapで持ち、
  // 同じカードに対して複数回イベントが来た場合（例:入れ替え後にさらに記録から読み込む等）は
  // 常に最後のイベントで上書きする。配列+findだと最初に見つかったイベントを使ってしまい、
  // 削除済みの古いセットidを参照してゴーストが表示されなくなる
  const [prefilledByCardId, setPrefilledByCardId] = useState<Map<number, PrefilledCard>>(() => new Map());
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  // 種目追加直後にオートフォーカスしたいカードの管理。宣言的なautoFocusプロパティは
  // 「戻る」の画面遷移アニメーション中にキーボードが被さって出るタイミング問題があるため
  // 使わず（app/exercise/new.tsxと同じ理由）、遷移完了(transitionEnd)後に該当カードへ
  // 命令的にfocus()する。以下の2条件が両方揃うまでは実際のfocus()を呼ばない：
  // (a) 戻り遷移が完了している（readyToFocusRef）
  // (b) 対象カードが実際にマウントされ、refがcardRefsに登録されている
  // 通知(pub/sub)とsessionExercisesのlive query更新・画面遷移完了の3つは互いに順序が
  // 保証されないため、この2条件をそれぞれ別のタイミング（transitionEnd／sessionExercises更新）
  // から満たしうるものとしてtryFocusを両方から呼び、揃った時点で初めて発火させる
  const cardRefsRef = useRef<Map<number, SessionExerciseCardHandle>>(new Map());
  const pendingFocusIdRef = useRef<number | null>(null);
  const readyToFocusRef = useRef(false);
  const tryFocus = useCallback(() => {
    const targetId = pendingFocusIdRef.current;
    if (targetId == null || !readyToFocusRef.current) return;
    const handle = cardRefsRef.current.get(targetId);
    if (!handle) return;
    handle.focusFirstSet();
    pendingFocusIdRef.current = null;
  }, []);
  useEffect(() => {
    return navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) {
        readyToFocusRef.current = true;
        tryFocus();
      }
    });
  }, [navigation, tryFocus]);
  // endedAtがあれば終了済み＝過去の記録を開いている（見た目は共用しつつ、進行中固有の
  // UI（リアルタイムタイマー・「トレーニングを終了」ボタン・種目カードの自動折りたたみ）だけを
  // 出し分ける）。hooksはこの後の早期returnより前で無条件に呼ぶ必要があるため、sessionが
  // まだnullの間もここで安全に評価できる形にしている
  const isActive = session != null && session.endedAt == null;
  const now = useTickingNow(isActive);
  const {
    collapsedIds,
    toggleCollapsed: handleToggleCollapsed,
    handleInteract,
  } = useAutoCollapseCompletedExercises(isActive, sessionExercises, sessionSets);

  // 種目追加/入れ替え画面はDB操作直後にrouter.back()で閉じるため、プリフィルが起きたことは
  // pub/sub経由でここに届く（lib/workout/prefill-feedback.ts）。他のセッション画面からの
  // 通知が紛れ込まないようsessionIdが一致するものだけ拾う
  useEffect(() => {
    if (sessionId == null) return;
    return subscribePrefilled((cards) => {
      const forThisSession = cards.filter((c) => c.sessionId === sessionId);
      if (forThisSession.length === 0) return;
      setPrefilledByCardId((prev) => {
        const next = new Map(prev);
        for (const c of forThisSession) next.set(c.sessionExerciseId, c);
        return next;
      });
      // 複数種目を同時追加した場合も、リスト上一番上に来る最初の新規カードだけにフォーカスする。
      // これから戻り遷移が始まる（呼び出し元がこの直後にrouter.back()する）ため、
      // まだ遷移が終わっていない状態としていったんリセットしておく
      const newCards = forThisSession.filter((c) => c.kind === 'new');
      if (newCards.length > 0) {
        pendingFocusIdRef.current = newCards[0].sessionExerciseId;
        readyToFocusRef.current = false;
      }
    });
  }, [sessionId]);

  // 戻り遷移が先に終わっていて、対象カードのマウント（live queryの更新）が後から来る
  // 順序の場合はこちらがtryFocusの発火役になる
  useEffect(() => {
    tryFocus();
  }, [sessionExercises, tryFocus]);

  const finish = async () => {
    if (sessionId == null) return;
    // 連打でendWorkoutSession/router.backが二重に呼ばれるのを防ぐ
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;
    try {
      await endWorkoutSession(sessionId);
      router.back();
    } catch (e) {
      console.error('[workout session finish]', e);
      Alert.alert('エラー', 'トレーニングを終了できませんでした。');
    } finally {
      isFinishingRef.current = false;
    }
  };

  const handleFinish = () => {
    if (setCount === 0) {
      Alert.alert('トレーニングを終了', 'まだ種目を記録していません。終了しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '終了する', style: 'destructive', onPress: finish },
      ]);
      return;
    }
    finish();
  };

  const handleAddExercise = () => {
    if (sessionId == null) return;
    router.push({ pathname: '/workout/exercise-picker', params: { sessionId: String(sessionId) } });
  };

  const handleLoadFromHistory = () => {
    if (sessionId == null) return;
    // Modalのフェードアウト中に連打されるとpushが二重発火しうるため、種目カード側の
    // 「過去の記録から読み込む」（session-exercise-card.tsx）や他画面の遷移と同じくデバウンスする
    pushDebounced({ pathname: '/workout/session-history-picker', params: { sessionId: String(sessionId) } });
  };

  const handleLoadFromRoutine = () => {
    if (sessionId == null) return;
    pushDebounced({ pathname: '/workout/routine-picker', params: { sessionId: String(sessionId) } });
  };

  const handleReorder = () => {
    if (sessionId == null) return;
    pushDebounced({ pathname: '/workout/exercise-reorder', params: { sessionId: String(sessionId) } });
  };

  const handleDeleteSession = () => {
    if (sessionId == null) return;
    Alert.alert('この記録を削除しますか？', '記録した種目・セットもすべて削除されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSession(sessionId);
            router.back();
          } catch (e) {
            console.error('[workout session delete]', e);
            Alert.alert('エラー', '記録を削除できませんでした。');
          }
        },
      },
    ]);
  };

  if (sessionId == null || (loaded && !session)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Stack.Screen options={{ title: 'トレーニング' }} />
        <NotFoundState
          message="トレーニングが見つかりません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  if (!session) return null;

  // カレンダー過去日パネル「記録を追加」経由で作られたセッション（startedAt=endedAt、
  // 2026-07-20）は所要時間の概念自体が無いため、タイマーチップを出さない。出すと常に「0分」
  // になり、実際に0分で終えた通常セッションと見分けが付かない「バグに見える表示」になる
  // ため（@designer指摘）
  const isPastRecordSession = session.endedAt === session.startedAt;

  const menuItems: DropdownMenuItem[] = [
    {
      key: 'add',
      label: '種目を追加',
      icon: 'add',
      // 画面下部（一覧末尾）のAddExerciseButtonと同じ操作。種目数が多いとボタンまで
      // スクロールする必要があるため、スクロール位置に関係なく開けるメニューにも用意する
      onPress: handleAddExercise,
    },
    {
      key: 'routine',
      label: 'ルーティンから読み込み',
      icon: 'fitness-center',
      disabled: routines.length === 0,
      hint:
        routines.length === 0
          ? '保存済みのルーティンがありません'
          : '保存済みのルーティンを選んで種目と目標セット値をまとめて追加します',
      onPress: handleLoadFromRoutine,
    },
    {
      key: 'history',
      label: '過去の記録から読み込み',
      icon: 'history',
      // 種目カード個別の⋮メニューにも同名の項目(1種目のセット値を置換)があるため、
      // こちらは複数種目をまとめて扱うことが分かるようhintで補足する
      hint: '過去のトレーニングを選んで複数の種目をまとめて追加します',
      onPress: handleLoadFromHistory,
    },
    {
      key: 'reorder',
      label: '種目を並び替え',
      icon: 'swap-vert',
      disabled: sessionExercises.length <= 1,
      hint: sessionExercises.length <= 1 ? '2種目以上あるときに使えます' : undefined,
      onPress: handleReorder,
    },
    { key: 'delete', label: '削除', icon: 'delete-outline', danger: true, onPress: handleDeleteSession },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle
              title={isActive ? 'トレーニング中' : '記録の編集'}
              subtitle={formatSessionDateGroup(session.startedAt)}
            />
          ),
          headerRight: () => <HeaderMenu groups={[menuItems]} accessibilityLabel="トレーニングのメニューを開く" />,
        }}
      />

      {!isPastRecordSession && (
        <ContextBar justify="flex-end">
          <View style={styles.timerChip}>
            <IconSymbol name="timer" size={16} color={Colors.accent} />
            <Text style={styles.timerText}>
              {isActive
                ? formatMinutesSeconds(now - session.startedAt)
                : formatSessionDuration(session.startedAt, session.endedAt)}
            </Text>
          </View>
        </ContextBar>
      )}

      {sessionExercises.length === 0 ? (
        <View style={styles.body}>
          <Text style={styles.emptyText}>まだ種目がありません</Text>
          <AddExerciseButton onPress={handleAddExercise} />
        </View>
      ) : (
        <FlatList
          style={styles.exerciseList}
          contentContainerStyle={styles.exerciseListContent}
          data={sessionExercises}
          keyExtractor={(item) => String(item.sessionExerciseId)}
          renderItem={({ item, index }) => {
            const prefilledEntry = prefilledByCardId.get(item.sessionExerciseId);
            return (
              <ListErrorBoundary>
                <SessionExerciseCard
                  ref={(handle) => {
                    if (handle) {
                      cardRefsRef.current.set(item.sessionExerciseId, handle);
                      if (pendingFocusIdRef.current === item.sessionExerciseId) tryFocus();
                    } else {
                      cardRefsRef.current.delete(item.sessionExerciseId);
                    }
                  }}
                  exercise={item}
                  sessionId={sessionId}
                  sets={sessionSets.get(item.sessionExerciseId) ?? EMPTY_SETS}
                  collapsed={collapsedIds.has(item.sessionExerciseId)}
                  isFirst={index === 0}
                  isLast={index === sessionExercises.length - 1}
                  previousSessionExerciseId={sessionExercises[index - 1]?.sessionExerciseId ?? null}
                  nextSessionExerciseId={sessionExercises[index + 1]?.sessionExerciseId ?? null}
                  onToggleCollapsed={handleToggleCollapsed}
                  onInteract={handleInteract}
                  prefilledSetIds={prefilledEntry?.prefilledSetIds ?? EMPTY_PREFILLED_SET_IDS}
                  hasHistory={exercisesWithHistory.has(item.id)}
                />
              </ListErrorBoundary>
            );
          }}
          ListFooterComponent={
            <AddExerciseButton onPress={handleAddExercise} style={styles.addExerciseBtnInline} />
          }
          contentInset={{ bottom: keyboardInset }}
          scrollIndicatorInsets={{ bottom: keyboardInset }}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {isActive && (
        <View style={styles.footer}>
          <PrimaryButton label="トレーニングを終了" onPress={handleFinish} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  // デザイン案のタイマーチップはfontWeight 700（セット入力欄の600より太い）
  timerText: { ...Typography.metric, fontWeight: '700', color: Colors.textPrimary },

  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  emptyText: { ...Typography.footnote, color: Colors.textMuted },

  exerciseList: { flex: 1 },
  // 末尾までスクロールした時に「トレーニングを終了」ボタンとAddExerciseButtonがくっついて
  // 見えないよう、下だけ他の辺より広めに余白を取る
  exerciseListContent: { padding: 16, paddingBottom: 32, gap: 10 },
  addExerciseBtnInline: { marginTop: 4 },

  footer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
