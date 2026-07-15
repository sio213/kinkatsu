import { CheckboxSelectHeader } from '@/components/ui/checkbox-select-header';
import { HeaderTitle } from '@/components/ui/header-title';
import { LoadSubmitFooter } from '@/components/ui/load-submit-footer';
import { NotFoundState } from '@/components/ui/not-found-state';
import { HistoryLoadExerciseCard } from '@/components/workout/history-load-exercise-card';
import { Colors } from '@/constants/theme';
import { useCheckboxSelection } from '@/hooks/use-checkbox-selection';
import { getSessionExerciseCards, type SessionHistoryCard } from '@/lib/workout/history';
import { formatSessionDateGroup } from '@/lib/workout/summary';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  sourceSessionId: number;
  sourceStartedAt: number;
  // 選択が確定した時点で呼ばれる。実際の反映先(DBへの一括insert/下書きストアへのappend)・
  // 成功時の後処理(通知・画面を閉じる)・失敗時のAlert表示は呼び出し側の責務とする
  onSubmit: (selectedCards: SessionHistoryCard[]) => Promise<void>;
};

// app/workout/session-history-load.tsx・app/routine/session-history-load.tsxの共通実装。
// 「選んだ過去セッションの種目をチェックボックスで選ぶ」という操作自体はどちらから開いても
// 同じ体験のため、取得・選択状態・見た目はここに一元化し、確定後の反映方法だけをonSubmitに委ねる
export function SessionHistoryLoadView({ sourceSessionId, sourceStartedAt, onSubmit }: Props) {
  const router = useRouter();
  const isSubmittingRef = useRef(false);

  // null=読み込み中、'error'=取得失敗、配列=取得成功（0件含む）。history-picker.tsxと同じ三値管理
  const [cards, setCards] = useState<SessionHistoryCard[] | 'error' | null>(null);
  const fetchCards = useCallback(() => {
    let cancelled = false;
    setCards(null);
    getSessionExerciseCards(sourceSessionId)
      .then((data) => {
        if (!cancelled) {
          setCards(data);
          // 初期状態は全選択（デザイン通り）
          selectAll(data.map((c) => c.workoutSessionExerciseId));
        }
      })
      .catch((e) => {
        console.error('[session exercise cards]', e);
        if (!cancelled) setCards('error');
      });
    return () => {
      cancelled = true;
    };
    // selectAllはuseCheckboxSelectionが返す安定した参照のためdepsに含めなくてよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSessionId]);
  useEffect(() => fetchCards(), [fetchCards]);

  const loadedCards = useMemo(() => (Array.isArray(cards) ? cards : []), [cards]);
  const cardIds = useMemo(() => loadedCards.map((c) => c.workoutSessionExerciseId), [loadedCards]);
  const { selectedIds, allSelected, toggle: handleToggle, toggleAll: handleToggleAll, selectAll } =
    useCheckboxSelection(cardIds);

  const handleSubmit = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      // loadedCards（orderIndex順）をfilterすることで、一部だけ選択してもselectionsの並びが
      // クリック順ではなく元セッションの表示順のまま保たれる（selectedIdsはSetのため挿入順に頼らない）
      const selections = loadedCards.filter((c) => selectedIds.has(c.workoutSessionExerciseId));
      await onSubmit(selections);
    } finally {
      isSubmittingRef.current = false;
    }
  }, [selectedIds, loadedCards, onSubmit]);

  const dateLabel = Number.isFinite(sourceStartedAt) ? formatSessionDateGroup(sourceStartedAt) : '';
  const submitLabel = allSelected ? 'すべて読み込む' : `${selectedIds.size}種目を読み込む`;
  const hasCards = Array.isArray(cards) && cards.length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen options={{ headerTitle: () => <HeaderTitle title="この記録から読み込み" subtitle={dateLabel} /> }} />

      {hasCards && (
        <CheckboxSelectHeader
          itemLabel="種目"
          selectedCount={selectedIds.size}
          totalCount={loadedCards.length}
          allSelected={allSelected}
          onToggleAll={handleToggleAll}
        />
      )}

      {cards === null ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      ) : cards === 'error' ? (
        <NotFoundState
          message="記録を読み込めませんでした"
          actionLabel="再試行"
          onPressAction={fetchCards}
        />
      ) : cards.length === 0 ? (
        <NotFoundState
          message="この日の記録がまだありません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      ) : (
        <FlatList
          style={styles.list}
          data={cards}
          keyExtractor={(item) => String(item.workoutSessionExerciseId)}
          renderItem={({ item }) => (
            <HistoryLoadExerciseCard
              card={item}
              selected={selectedIds.has(item.workoutSessionExerciseId)}
              onToggle={handleToggle}
            />
          )}
          contentContainerStyle={styles.content}
        />
      )}

      {hasCards && (
        <LoadSubmitFooter label={submitLabel} onPress={handleSubmit} disabled={selectedIds.size === 0} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 16 },
});
