import { ExerciseRecordCard } from '@/components/exercises/exercise-record-card';
import { HeaderTitle } from '@/components/ui/header-title';
import { ListErrorBoundary } from '@/components/ui/list-error-boundary';
import { RecordListHeading } from '@/components/workout/record-list-heading';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors, ScreenStyles, Typography } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useExercise } from '@/hooks/use-exercises';
import { useExerciseProgress } from '@/hooks/use-exercise-progress';
import { resolveMeasurementType } from '@/lib/exercises/constants';
import { findPersonalBest, type ProgressPoint } from '@/lib/exercises/progress';
import { toMonthSections } from '@/lib/workout/summary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  /**
   * タブ配下のStack（/exercises/history/[id]）から表示されているか。
   * タブバーが下端を占有するぶんSafeAreaの下辺インセットが不要になるため切り替える
   * （exercise-detail-screen.tsx と同じ理由・CLAUDE.md「ナビゲーション・タブバーの表示範囲」）。
   */
  insideTabBar?: boolean;
};

/**
 * 種目1つ分の「過去の記録」画面。記録タブの「すべての記録を見る」から遷移する。
 *
 * 種目詳細と同じく2つのURLから共有される（components/exercises/exercise-detail-screen.tsx参照）。
 * カードは記録タブの一覧と同じ ExerciseRecordCard で、月見出しで区切って全件を並べる。
 */
export function ExerciseHistoryScreen({ insideTabBar = false }: Props) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const push = useDebouncedPush();

  const exerciseId = Number(id);
  const { exercise, loaded: exerciseLoaded } = useExercise(exerciseId);
  const measurementType = resolveMeasurementType(exercise?.measurementType);
  // chartMeasurementType を使うこと。重量を1度も記録していない加重種目は reps 種目として
  // 系列が組まれるので、生の measurementType で描くとセットの値が全て空になる
  const { series, recordDays, chartMeasurementType, loaded, failed } = useExerciseProgress(
    exerciseId,
    measurementType,
  );

  // ベストの判定は全期間の系列で行う（グラフのアンバー・内訳カードのバッジと同じ入口）
  const personalBest = useMemo(() => findPersonalBest(series.points), [series.points]);
  // 系列は古い順なので、一覧は新しい順に並べ替えてから月でまとめる
  // 一覧は recordDays を使う。加重なしでやった日もやった事実として並べる（グラフには出ない）
  const sections = useMemo(() => toMonthSections([...recordDays].reverse()), [recordDays]);

  const safeAreaEdges = insideTabBar ? ([] as const) : (['bottom'] as const);
  // 件数はサブタイトルではなく一覧の見出し行に置く（デザイン案の採用案4-2）。
  // ヘッダーは「どの種目の記録か」だけを示す
  const subtitle = exercise?.name;

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={safeAreaEdges}>
      <Stack.Screen
        options={{ headerTitle: () => <HeaderTitle title="過去の記録" subtitle={subtitle} /> }}
      />

      {failed ? (
        <NotFoundState
          message="記録を読み込めませんでした"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      ) : !loaded || !exerciseLoaded ? null : recordDays.length === 0 ? (
        <NotFoundState
          message="この種目の記録がまだありません"
          actionLabel="戻る"
          onPressAction={() => router.back()}
        />
      ) : (
        <SectionList
          style={styles.list}
          sections={sections}
          keyExtractor={(item) => String(item.dateKey)}
          renderItem={({ item }: { item: ProgressPoint }) => (
            // 他の一覧と同じく、1行の描画例外で画面全体を落とさないよう行単位で囲う
            <ListErrorBoundary>
              <ExerciseRecordCard
                point={item}
                measurementType={chartMeasurementType}
                isBest={item.dateKey === personalBest?.dateKey}
                onPress={(sessionId) => push(`/workout/${sessionId}`)}
              />
            </ListErrorBoundary>
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.monthLabelWrapper}>
              <Text style={styles.monthLabel}>{section.title}</Text>
            </View>
          )}
          // 件数は一覧に並ぶ日数と一致させる（自重の日も含む。グラフの点数とは一致しない）
          ListHeaderComponent={
            <RecordListHeading label="記録一覧" count={recordDays.length} style={styles.listHeading} />
          }
          ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          contentContainerStyle={styles.content}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  listHeading: { marginBottom: 8 },
  // スクロール中はスティッキーヘッダーとして固定されるため、背面のカードが透けないよう
  // marginHorizontalでcontentの左右paddingを打ち消して画面端まで塗りつぶす
  // （ExerciseHistoryPickerViewと同じ扱い）
  monthLabelWrapper: {
    backgroundColor: Colors.background,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  monthLabel: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted },
  cardSeparator: { height: 8 },
  sectionSeparator: { height: 16 },
});
