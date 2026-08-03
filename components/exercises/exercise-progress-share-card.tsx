import { ExerciseProgressChart } from '@/components/exercises/exercise-progress-chart';
import { Colors, Typography } from '@/constants/theme';
import type { HighlightKind } from '@/lib/exercises/chart-layout';
import type { ProgressLeadIn, ProgressPoint, ProgressUnit } from '@/lib/exercises/progress';
import { SHARE_APP_NAME, SHARE_HASHTAGS } from '@/lib/share/progress-share';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * 共有カードの幅。**端末の画面幅に追従させないこと。** 追従させると書き出される画像の
 * 解像度が端末ごとに変わり、SNS側のトリミングのかかり方まで変わってしまう。
 */
const CARD_WIDTH = 320;

type Props = {
  exerciseName: string;
  /** 「3ヶ月」など、いま見ている期間。グラフの横軸が何を指すか画像だけで分かるようにする */
  periodLabel: string;
  /** 「最大重量」など指標名。最大○○のときはnullで、値だけを出す */
  metricLabel: string | null;
  /** 代表値（整形済み）。点が1つも無ければnullで、値の行ごと消える */
  value: string | null;
  unit: string;
  /** 値が実測の自己ベストか。trueのときだけ★を添える（グラフ側のFIX-10と同じ線引き） */
  isPersonalBest: boolean;
  points: ProgressPoint[];
  chartUnit: ProgressUnit;
  highlight: ProgressPoint | null;
  highlightKind: HighlightKind;
  leadIn: ProgressLeadIn | null;
};

/**
 * SNS共有用のカード。プレビューとして画面に表示し、そのままこのViewを画像に焼く
 * （lib/share/progress-share.ts の shareProgressCard）。
 *
 * **画面に出さずに裏で描いてキャプチャする作りにしないこと。** 画面外のViewはキャプチャが
 * 空になることがあり、Androidでは最適化でView自体が消える。ユーザーが「何が共有されるか」を
 * 見てから押せる利点もあるので、プレビューを兼ねて実際に表示する。
 *
 * アプリ名とハッシュタグを画像の中に焼き込んでいるのが要点。共有シートに渡すテキストは
 * 受け側アプリ（特にX）が拾わないことがあるため、テキストが1文字も渡らなくても
 * 「どのアプリの画面か」が残るようにしている。
 */
export const ExerciseProgressShareCard = forwardRef<View, Props>(function ExerciseProgressShareCard(
  {
    exerciseName,
    periodLabel,
    metricLabel,
    value,
    unit,
    isPersonalBest,
    points,
    chartUnit,
    highlight,
    highlightKind,
    leadIn,
  },
  ref,
) {
  return (
    // collapsable={false} はAndroid用。付けないとRNの最適化でこのViewがネイティブ階層から
    // 消え、キャプチャ対象が見つからずに失敗する
    <View ref={ref} collapsable={false} style={styles.card}>
      <Text style={styles.exerciseName} numberOfLines={1}>
        {exerciseName}
      </Text>
      <Text style={styles.subtitle}>
        {metricLabel == null ? '記録の推移' : metricLabel}・{periodLabel}
      </Text>

      {/* pointerEvents="none" でグラフのGestureDetectorごと止める。共有カードは見せるだけの
          静止画で、点を選ばせる必要が無い。Modalは別のネイティブ階層になるため
          GestureHandlerRootViewの外に出てしまう問題も、触らせなければ起きない */}
      <View style={styles.chartWrap} pointerEvents="none">
        <ExerciseProgressChart
          points={points}
          unit={chartUnit}
          highlight={highlight}
          highlightKind={highlightKind}
          leadIn={leadIn}
          // 選択の縦破線とツールチップは共有画像に写り込ませない。「操作中の状態」であって
          // 記録そのものではないため
          selectedIndex={null}
          onSelect={() => {}}
        />
      </View>

      {value != null && (
        <View style={styles.valueRow}>
          <Text style={styles.value}>
            {value}
            <Text style={styles.valueUnit}>{unit}</Text>
          </Text>
          {isPersonalBest && <Text style={styles.bestBadge}>★ 自己ベスト</Text>}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.appName}>{SHARE_APP_NAME}</Text>
        <Text style={styles.hashtags}>{SHARE_HASHTAGS.join(' ')}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 4,
  },
  exerciseName: { ...Typography.navTitle, color: Colors.textPrimary },
  subtitle: { ...Typography.caption, color: Colors.textSecondary },
  chartWrap: { marginTop: 4 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  value: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: Colors.textPrimary },
  valueUnit: { ...Typography.footnote, fontWeight: '600', color: Colors.textMuted },
  bestBadge: { ...Typography.caption, fontWeight: '700', color: Colors.chartBestText },
  footer: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // ロゴが出来たらここをロゴ画像に差し替える（KB-256）。それまでは文字で代用
  appName: { ...Typography.cardTitle, color: Colors.accent },
  hashtags: { ...Typography.captionCompact, color: Colors.textMuted },
});
