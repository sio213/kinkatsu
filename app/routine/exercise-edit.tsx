import { RoutineAddExerciseButton } from '@/components/routines/routine-add-exercise-button';
import {
  RoutineTemplateExerciseCard,
  type RoutineTemplateExerciseCardHandle,
} from '@/components/routines/routine-template-exercise-card';
import { HeaderMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useExercisesWithHistory } from '@/hooks/use-workout-session';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { NO_SESSION_TO_EXCLUDE } from '@/lib/workout/history';
import type { ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ルーティンの下書き（useRoutineDraftStore）にある全種目をまとめて編集する画面。
// 種目の追加・並び順はルーティンフォーム側で行い、この画面はセットの追加・削除・値編集と
// 種目単体の削除・並び替え・入れ替え・過去記録の読み込み（⋮メニュー）に専念する。保存操作の実体は
// 無く、ヘッダーの戻るアイコンで抜けても結果は同じであることが分かるよう、フッターのボタンも
// 「保存」ではなく実態通り「戻る」とする
export default function RoutineExerciseEditScreen() {
  const router = useRouter();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { focusIndex: focusIndexParam } = useLocalSearchParams<{ focusIndex?: string }>();
  const focusIndex = focusIndexParam != null ? Number(focusIndexParam) : null;
  const exercises = useRoutineDraftStore((state) => state.exercises);
  const lastAddedAt = useRoutineDraftStore((state) => state.lastAddedAt);
  const keyboardInset = useKeyboardInset();
  const historyExerciseIds = useExercisesWithHistory(NO_SESSION_TO_EXCLUDE);

  // ルーティンフォームの種目一覧でタップした種目のカードまで自動スクロールするための位置計測。
  // 各カードの実際のレイアウトはonLayoutでしか分からないため、行(list)自体とタップされた
  // 種目カードの両方のY座標が判明した時点で一度だけscrollToする
  const scrollRef = useRef<ScrollView>(null);
  // list・item(親子)のonLayoutは発火順序が保証されないため、初期値をnullにして
  // 「まだ測定されていない」ことと「実際にy=0」を区別できるようにする
  const listOffsetRef = useRef<number | null>(null);
  const itemOffsetsRef = useRef<Record<number, number>>({});
  const scrolledToFocusRef = useRef(false);

  const tryScrollToFocus = useCallback(() => {
    if (scrolledToFocusRef.current || focusIndex == null) return;
    const listY = listOffsetRef.current;
    const itemY = itemOffsetsRef.current[focusIndex];
    if (listY == null || itemY == null) return;
    scrolledToFocusRef.current = true;
    // 画面遷移のスライドが終わる前に確定させ、遷移完了時には既にその位置にいるように見せる
    // (遷移後に改めてスクロールするとジャンプが二重に見えてしまう)。
    // 対象カードの上端をそのまま画面上端に合わせるとcontentのpaddingTop分だけ他の画面より
    // 詰まって見えるため、通常スクロール時と同じ見た目のリズムになるよう差し引く
    const y = Math.max(0, listY + itemY - styles.content.paddingTop);
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [focusIndex]);

  // 種目追加ピッカー・過去の記録から読み込む(セッション単位)画面から戻った直後、追加された
  // 最初のカードまで自動スクロールする。focusIndexと違いこの画面を離れず何度でも起こりうるため、
  // 一度きりのフラグ(scrolledToFocusRef)ではなくtokenで「前回処理済みの追加と同じか」を判定する
  const lastHandledScrollTokenRef = useRef<number | null>(null);
  // トレーニング中画面(app/workout/[id].tsx)のcardRefsRefと同じ考え方。追加された最初のカードの
  // 最初のセット重量入力欄にもフォーカスし、そのまま数値を打ち込めるようにする。keyはDraftExercise
  // に安定id(DBのidに相当するもの)が無いため配列indexを使うが、追加直後の一度きりの参照にしか
  // 使わないため、その後の並び替え・削除でindexがズレても影響しない
  const cardRefsRef = useRef<Map<number, RoutineTemplateExerciseCardHandle>>(new Map());
  // フォーカス(=キーボード表示)はスクロールと違い、画面遷移のスライドアニメーション中に起きると
  // キーボードがせり出しながらレイアウトが動く見た目のジャンクになる（トレーニング中画面
  // (app/workout/[id].tsx)がtransitionEndを待ってからfocusFirstSet()する理由と同じ）。
  // そのため、スクロールのトークン消費とは別に、フォーカスの成否を独立したトークンで管理し、
  // 画面遷移が完了する(readyToFocusRef=true)までは実行を待たせ、取りこぼさず後から再試行できるようにする
  const lastHandledFocusTokenRef = useRef<number | null>(null);
  const readyToFocusRef = useRef(false);

  const tryScrollToAdded = useCallback(() => {
    if (lastAddedAt == null || lastAddedAt.token === lastHandledScrollTokenRef.current) return;
    const listY = listOffsetRef.current;
    const itemY = itemOffsetsRef.current[lastAddedAt.index];
    if (listY == null || itemY == null) return;
    lastHandledScrollTokenRef.current = lastAddedAt.token;
    const y = Math.max(0, listY + itemY - styles.content.paddingTop);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, [lastAddedAt]);

  const tryFocusAdded = useCallback(() => {
    if (
      lastAddedAt == null ||
      !lastAddedAt.shouldFocus ||
      lastAddedAt.token === lastHandledFocusTokenRef.current ||
      !readyToFocusRef.current
    ) {
      return;
    }
    const handle = cardRefsRef.current.get(lastAddedAt.index);
    if (!handle) return;
    lastHandledFocusTokenRef.current = lastAddedAt.token;
    handle.focusFirstSet();
  }, [lastAddedAt]);

  // ルーティンフォームからexercise-editへの初回遷移(push/replace)・種目追加ピッカーや
  // 過去の記録から読み込む画面からexercise-editへ戻る遷移(pop/dismiss)のどちらでも、
  // このスクリーン自身のtransitionEndが「今まさに見えている状態になった」タイミングを表す
  useEffect(() => {
    return navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) {
        readyToFocusRef.current = true;
        tryFocusAdded();
      }
    });
  }, [navigation, tryFocusAdded]);

  const handleListLayout = useCallback(
    (e: LayoutChangeEvent) => {
      listOffsetRef.current = e.nativeEvent.layout.y;
      tryScrollToFocus();
      tryScrollToAdded();
      tryFocusAdded();
    },
    [tryScrollToFocus, tryScrollToAdded, tryFocusAdded],
  );

  const handleItemLayout = useCallback(
    (index: number) => (e: LayoutChangeEvent) => {
      itemOffsetsRef.current[index] = e.nativeEvent.layout.y;
      tryScrollToFocus();
      tryScrollToAdded();
      tryFocusAdded();
    },
    [tryScrollToFocus, tryScrollToAdded, tryFocusAdded],
  );

  const handleAddExercise = useCallback(() => {
    // この画面自身から開いた場合は、確定後にこのままこの画面へ戻ればよい(ドラフトストアは
    // 共有なので新しい種目は自動で反映される)。ルーティンフォーム画面から開いた場合(この画面を
    // 経由しない)と区別するため、returnToパラメータで「既にこの画面を経由している」ことを伝える
    router.push({ pathname: '/routine/exercise-picker', params: { returnTo: 'exercise-edit' } });
  }, [router]);

  const handleReorder = useCallback(() => {
    router.push('/routine/exercise-reorder');
  }, [router]);

  const handleLoadFromHistory = useCallback(() => {
    router.push('/routine/session-history-picker');
  }, [router]);

  const menuItems: DropdownMenuItem[] = [
    {
      key: 'history',
      label: '過去の記録から読み込む',
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
      disabled: exercises.length <= 1,
      hint: exercises.length <= 1 ? '2種目以上あるときに使えます' : undefined,
      onPress: handleReorder,
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => <HeaderMenu groups={[menuItems]} accessibilityLabel="種目編集のメニューを開く" />,
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        contentInset={{ bottom: keyboardInset }}
        scrollIndicatorInsets={{ bottom: keyboardInset }}
        keyboardShouldPersistTaps="handled"
      >
        {exercises.length === 0 ? (
          <RoutineAddExerciseButton variant="empty" onPress={handleAddExercise} />
        ) : (
          <View testID="exercise-list" style={styles.list} onLayout={handleListLayout}>
            {exercises.map((exercise, index) => (
              <View key={`${exercise.exerciseId}-${index}`} testID={`exercise-item-${index}`} onLayout={handleItemLayout(index)}>
                <RoutineTemplateExerciseCard
                  ref={(handle) => {
                    if (handle) {
                      cardRefsRef.current.set(index, handle);
                      if (lastAddedAt?.index === index) tryFocusAdded();
                    } else {
                      cardRefsRef.current.delete(index);
                    }
                  }}
                  exercise={exercise}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === exercises.length - 1}
                  hasHistory={historyExerciseIds.has(exercise.exerciseId)}
                />
              </View>
            ))}
            <RoutineAddExerciseButton variant="ghost" onPress={handleAddExercise} />
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label="戻る" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },

  list: { gap: 10 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
