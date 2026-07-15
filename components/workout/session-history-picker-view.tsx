import { CategoryFilterChips } from '@/components/exercises/category-filter-chips';
import { NotFoundState } from '@/components/ui/not-found-state';
import { PastTrainingSessionCard } from '@/components/workout/past-training-session-card';
import { Colors, Typography } from '@/constants/theme';
import { CATEGORY_ALL, CATEGORY_ORDER, UNKNOWN_CATEGORY_ORDER } from '@/lib/exercises/constants';
import { getPastTrainingSessions, type PastTrainingSession } from '@/lib/workout/history';
import { groupByMonth } from '@/lib/workout/summary';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 1ページあたりの取得件数。ヘビーユーザーほどセッション数が線形に増えるため全件取得を避け、
// 直近PAGE_SIZE件をまず表示し、下までスクロールしたら追加取得する
export const PAGE_SIZE = 30;

type Props = {
  // トレーニング画面からは自分自身のsessionId（実績として参照しないため）、ルーティンからは
  // 「進行中セッション」という概念自体が無いためNO_SESSION_TO_EXCLUDE(-1)を渡す
  excludeSessionId: number;
  onSelect: (session: PastTrainingSession) => void;
};

// app/workout/session-history-picker.tsx・app/routine/session-history-picker.tsxの共通実装。
// 「過去のトレーニングを1つ選ぶ」という操作自体はトレーニング画面・ルーティンどちらから
// 開いても同じ体験のため、除外セッションIDと選択後の遷移先（onSelect）だけを呼び出し側に委ね、
// 一覧取得・ページング・カテゴリ絞り込みのロジックと見た目はここに一元化する
export function SessionHistoryPickerView({ excludeSessionId, onSelect }: Props) {
  const router = useRouter();

  const [activeCategory, setActiveCategory] = useState<string>(CATEGORY_ALL);
  // handleLoadMoreの絞り込み中自動継続判定用。activeCategoryをdepsに含めるとhandleLoadMoreの
  // 参照が絞り込みのたびに作り直されてしまうため、refで最新値だけ参照する
  const activeCategoryRef = useRef(activeCategory);
  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);

  // null=読み込み中、'error'=取得失敗、配列=取得成功（0件含む）。history-picker.tsxと同じ三値管理
  const [sessions, setSessions] = useState<PastTrainingSession[] | 'error' | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  // hasMore/loadingMore/nextOffsetはページング制御専用の値でUIの再描画に直結しないため、
  // stateにすると再フェッチのuseEffectを誘発したり、onEndReachedの連続発火時に古いクロージャの
  // stateを見て二重フェッチ（＝1ページ分のデータが永久に読めなくなる）を起こしかねない。
  // そのためrefにまとめ、同期的にガード・更新する
  const pagingRef = useRef({ hasMore: true, loadingMore: false, nextOffset: 0 });
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const fetchSessions = useCallback(() => {
    let cancelled = false;
    setSessions(null);
    setLoadMoreError(false);
    pagingRef.current = { hasMore: true, loadingMore: false, nextOffset: 0 };
    getPastTrainingSessions(excludeSessionId, { limit: PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (cancelled || !mountedRef.current) return;
        setSessions(page.sessions);
        pagingRef.current.hasMore = page.hasMore;
        pagingRef.current.nextOffset = PAGE_SIZE;
      })
      .catch((e) => {
        console.error('[past training sessions]', e);
        if (!cancelled && mountedRef.current) setSessions('error');
      });
    return () => {
      cancelled = true;
    };
  }, [excludeSessionId]);
  useEffect(() => fetchSessions(), [fetchSessions]);

  const handleLoadMore = useCallback(() => {
    const paging = pagingRef.current;
    if (!paging.hasMore || paging.loadingMore) return;
    paging.loadingMore = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    const offset = paging.nextOffset;
    getPastTrainingSessions(excludeSessionId, { limit: PAGE_SIZE, offset })
      .then((page) => {
        if (!mountedRef.current) return;
        setSessions((prev) => (Array.isArray(prev) ? [...prev, ...page.sessions] : page.sessions));
        paging.hasMore = page.hasMore;
        paging.nextOffset = offset + PAGE_SIZE;

        // カテゴリ絞り込み中、このページが選択中カテゴリを1件も含まないと画面上のリスト高が
        // 伸びずonEndReachedが再発火しない可能性があるため、該当が見つかるかhasMoreが尽きるまで
        // ユーザーの追加スクロールを待たずに内部で次ページを追い続ける
        const category = activeCategoryRef.current;
        const matchesFilter =
          category === CATEGORY_ALL ||
          page.sessions.some((s) => s.exercises.some((e) => e.category === category));
        if (!matchesFilter && paging.hasMore) {
          paging.loadingMore = false;
          handleLoadMore();
          return;
        }
        paging.loadingMore = false;
        setLoadingMore(false);
      })
      .catch((e) => {
        // 書き込みではなく再取得可能な読み込みのため、失敗時は画面全体をエラー状態にせず
        // フッターに再試行導線を出すだけにとどめる（onEndReachedの再発火頼みだと、末尾で
        // 発生した失敗の場合はリスト高が変わらず再発火しないことがあるため）
        console.error('[past training sessions load more]', e);
        if (!mountedRef.current) return;
        paging.loadingMore = false;
        setLoadingMore(false);
        setLoadMoreError(true);
      });
  }, [excludeSessionId]);

  const loadedSessions = useMemo(() => (Array.isArray(sessions) ? sessions : []), [sessions]);

  // 実際にこの一覧に含まれるカテゴリだけをチップとして出す（押しても0件になるだけのチップを避けるため）。
  // ★お気に入りは種目一覧・種目追加ピッカー専用の概念でこの画面には無関係なため含めない
  const categoryChips = useMemo(() => {
    const present = new Set<string>();
    for (const s of loadedSessions) {
      for (const e of s.exercises) present.add(e.category);
    }
    const sorted = Array.from(present).sort(
      (a, b) => (CATEGORY_ORDER[a] ?? UNKNOWN_CATEGORY_ORDER) - (CATEGORY_ORDER[b] ?? UNKNOWN_CATEGORY_ORDER),
    );
    return [CATEGORY_ALL, ...sorted];
  }, [loadedSessions]);

  const filteredSessions = useMemo(() => {
    if (activeCategory === CATEGORY_ALL) return loadedSessions;
    return loadedSessions.filter((s) => s.exercises.some((e) => e.category === activeCategory));
  }, [loadedSessions, activeCategory]);

  const sections = useMemo(
    () => groupByMonth(filteredSessions).map((group) => ({ title: group.monthLabel, data: group.items })),
    [filteredSessions],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {Array.isArray(sessions) && sessions.length > 0 && (
        <View style={styles.chipsWrap}>
          <CategoryFilterChips
            activeCategory={activeCategory}
            onChange={setActiveCategory}
            categories={categoryChips}
          />
        </View>
      )}

      {sessions === null ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.accent} accessibilityLabel="読み込み中" />
        </View>
      ) : sessions === 'error' ? (
        <NotFoundState
          message="記録を読み込めませんでした"
          actionLabel="再試行"
          onPressAction={fetchSessions}
        />
      ) : sessions.length === 0 ? (
        <NotFoundState
          message="過去のトレーニング記録がまだありません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      ) : filteredSessions.length === 0 ? (
        loadingMore ? (
          // カテゴリ絞り込み中に該当ページがまだ見つかっていないだけの状態。ここで空状態を
          // 出すと「本当は続きに記録があるのに0件に見える」誤解を招くため読み込み中として扱う
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={Colors.accent} accessibilityLabel="読み込み中" />
          </View>
        ) : loadMoreError ? (
          <NotFoundState
            message="記録を読み込めませんでした"
            actionLabel="再試行"
            onPressAction={handleLoadMore}
          />
        ) : (
          // categoryChipsは常にloadedSessionsの実データから作るため通常はここに到達しないが、
          // activeCategoryが選択された後にデータが変わり該当カテゴリが無くなるケースへの防御として残す
          <View style={styles.emptyWrapper}>
            <Text style={styles.empty}>該当する記録がありません</Text>
          </View>
        )
      ) : (
        <SectionList
          style={styles.list}
          sections={sections}
          keyExtractor={(item) => String(item.sessionId)}
          renderItem={({ item }) => <PastTrainingSessionCard session={item} onPress={onSelect} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.monthLabelWrapper}>
              <Text style={styles.monthLabel}>{section.title}</Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          contentContainerStyle={styles.content}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator size="small" color={Colors.accent} accessibilityLabel="読み込み中" />
              </View>
            ) : loadMoreError ? (
              <TouchableOpacity
                style={styles.footerError}
                onPress={handleLoadMore}
                accessibilityRole="button"
                accessibilityLabel="記録の読み込みを再試行"
              >
                <Text style={styles.footerErrorText}>読み込みに失敗しました。タップして再試行</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  chipsWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  empty: { color: Colors.textMuted, ...Typography.body, textAlign: 'center' },

  list: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  // history-picker.tsxと同じ理由でスティッキーヘッダーの背面を不透明にする
  monthLabelWrapper: {
    backgroundColor: Colors.background,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  monthLabel: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted },
  cardSeparator: { height: 8 },
  sectionSeparator: { height: 16 },
  footerLoading: { paddingVertical: 16, alignItems: 'center' },
  footerError: { paddingVertical: 16, alignItems: 'center' },
  footerErrorText: { ...Typography.footnote, color: Colors.textMuted },
});
