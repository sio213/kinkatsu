import { Colors, Typography } from '@/constants/theme';
import { addMonths, CELLS_PER_WEEK, weeksInMonthGrid } from '@/lib/calendar/date-grid';
import { WEEKDAY_LABELS } from '@/lib/format';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MonthGrid } from './month-grid';

// 曜日ラベル行の日曜(index 0)・土曜(index 6)だけ色を付ける。日付の数字自体は
// どの状態（今日・選択中・実施日など）でも曜日色を混ぜず、実施状況の色分けだけに専念させる
// （デザイン案通り、曜日色は見出し行のみの装飾）
function weekdayLabelStyle(index: number) {
  if (index === 0) return styles.sundayLabel;
  if (index === 6) return styles.saturdayLabel;
  return null;
}

type Props = {
  year: number;
  month: number; // 0-11
  today: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  // 呼び出し元(app/(tabs)/calendar.tsx)のviewed state更新。スワイプが確定した後に
  // 1回だけ呼ばれる（アニメーションの途中経過ではstateを更新しない）
  onChangeMonth: (delta: number) => void;
  // 前月/当月/翌月をまたぐ範囲を1回のクエリでまとめて取得したもの（呼び出し元が用意）。
  // 3つのMonthGridで共通のMapをそのまま参照させ、ここでは分割しない
  primaryCategoryByDay: Map<string, string>;
  categorySetByDay: Map<string, Set<string>>;
  primaryCategoryByScheduleDay: Map<string, string>;
  categorySetByScheduleDay: Map<string, Set<string>>;
  activeFilter: string | null;
};

// このくらい動かした/このくらいの速度が出ていれば「月を切り替える意図」とみなすしきい値。
// 両方ともOR条件（どちらかを満たせば切り替え）にすることで、ゆっくり大きくドラッグしても・
// 素早くフリックしても、どちらでも自然に切り替わるようにする
const SWIPE_DISTANCE_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 800;
const SNAP_DURATION_MS = 240;
// スロット間の隙間（背景色の帯）。前月/当月/翌月の3枚を直接隣接させてスライドさせると、
// ドラッグ中(指を離す前、まだ月境界を跨いだ位置)にビューポートが2スロットのちょうど境界に
// かかった時、隣接する2つの月の日付セルが余白無く繋がって見え、両方とも7列グリッドという
// 構造が同じせいで「一見自然だが実在しない日付配置」に見えてしまう不具合が実機で確認された
// （曜日ヘッダーは既にスライド対象から外して固定表示にしたが、日付本体は月ごとに内容が
// 変わる以上スライドさせざるを得ない）。スロット間に不透明な背景色の隙間を挟むことで、
// ドラッグ中に必ず「2つの月の間に切れ目がある」ことが視覚的に分かるようにし、
// 断片同士がシームレスに繋がって見える錯覚そのものを構造的に防ぐ
const SLOT_GAP = 12;

// 前月/当月/翌月の3画面分を横に並べたトラックをスワイプ量だけ動かし、指を離した位置に応じて
// 「隣の月へスナップ」か「元に戻る」かをアニメーションさせるカルーセル。
// タップ操作（onSelectDate）はactiveOffsetXの範囲内では発火しないため、日付セルの
// TouchableOpacityと共存できる
export function SwipeableMonthView({
  year,
  month,
  today,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  primaryCategoryByDay,
  categorySetByDay,
  primaryCategoryByScheduleDay,
  categorySetByScheduleDay,
  activeFilter,
}: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useSharedValue(0);

  // 3スロット(前月/当月/翌月)の表示ラベル。year/month propsをそのまま使わず1テンポ遅らせて
  // 保持するのがポイント（詳細は下のuseLayoutEffect参照）。呼び出し元(calendar.tsx)の
  // viewed stateと同様、year/monthは常にセットで更新するため1つのオブジェクトにまとめる
  const [display, setDisplay] = useState({ year, month });

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // 月ごとに4〜6週で行数が変わる（lib/calendar/date-grid.tsのweeksInMonthGrid）ため、
  // 3ヶ月分を横に並べたtrackの高さをそのままviewportに使うと「一番週数が多い月」の高さに
  // 固定され、週数の少ない月を見ている間は下に余白ができてしまう。以前はonLayoutでの実測に
  // 頼っていたが、実測は「描画が終わってからその結果を受け取る」非同期処理のため、月送り直後の
  // 1コミットには間に合わないことがあった。特に週数が変わる月をまたぐ場合（例:
  // 6週の月→5週の月）、実測値の反映が遅れている間ページ全体の高さがズレたままになり、
  // ページ下部の日別パネルの見出しがスクロール位置ごと隠れて見える不具合になっていた
  // （実機の画面録画で確認済み）。MonthGridの各セルは`aspectRatio:1`の正方形（一辺の長さは
  // 常にcontainerWidthの1/7）なので、週数さえ分かれば高さはonLayoutを待たずその場で計算でき、
  // displayの更新と同じコミットで即座に確定させられる
  const currentHeight = useMemo(() => {
    if (containerWidth === 0) return 0;
    const rowHeight = containerWidth / CELLS_PER_WEEK;
    return weeksInMonthGrid(display.year, display.month) * rowHeight;
  }, [containerWidth, display]);

  // アニメーションが隣の月の位置まで完全にスナップし終えたタイミングでonChangeMonthを呼び、
  // year/monthを実際に切り替える。ここでtranslateXを即0に戻さないのがポイント：
  // onChangeMonth(setState)は非同期に反映されるため、同じ関数内でtranslateXを先に0へ戻すと
  // 「新しいprops(year/month)がまだ反映されていない一瞬」に0の位置(=古い当月)が見えてしまい、
  // 数字が一瞬別の月にズレて見える不具合になる。リセットは下のuseLayoutEffectでprops反映後に行う
  const commitMonthChange = useCallback(
    (delta: number) => {
      onChangeMonth(delta);
    },
    [onChangeMonth],
  );

  // year/monthのprops更新がコミットされた直後（画面に描画される前）にtranslateXを0へ戻す。
  // useEffectだと描画後になり1フレーム分ズレて見えることがあるため、描画前に同期実行される
  // useLayoutEffectを使う。ヘッダーの矢印タップ（スワイプを経ない月送り）でもtranslateXは
  // 元々0のままなので、ここでの再代入は無害。
  // displayYear/displayMonth（prev/current/nextラベルの算出元）もここで初めてyear/monthに
  // 同期させる。もしprev/nextをyear/monthから直接算出していると、「year/month propsが
  // コミットされてから、この副作用が実行されるまでの間」に一度描画が走り、その一瞬だけ
  // 「まだ画面上はスワイプ後の位置に到達していない（translateXが0に戻っていない）のに、
  // オフスクリーン側だったスロットの中身だけ次の月にラベル変更される」→本来まだ見えてはいけない
  // 「さらに1つ先の月」が着地位置にちらつくバグになる(実機ログで確認済み)。
  // displayをここに閉じ込め、setStateをtranslateXのリセットと同じ実行タイミングに
  // 揃えることで、「位置が戻る」のと「中身が切り替わる」を必ず同じコミットにする
  useLayoutEffect(() => {
    translateX.value = 0;
    setDisplay({ year, month });
  }, [year, month, translateX]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        // 縦方向に一定量動いたら即座にこのPanジェスチャーを失敗させ、親のScrollView（縦スクロール）
        // へ調停を譲る。activeOffsetXだけだと斜めフリック時に意図せず月送りが発火する余地があった
        .failOffsetY([-15, 15])
        .onUpdate((e) => {
          translateX.value = e.translationX;
        })
        .onEnd((e) => {
          const goNext = e.translationX < -SWIPE_DISTANCE_THRESHOLD || e.velocityX < -SWIPE_VELOCITY_THRESHOLD;
          const goPrev = e.translationX > SWIPE_DISTANCE_THRESHOLD || e.velocityX > SWIPE_VELOCITY_THRESHOLD;
          // 隣のスロットの位置は「1スロット分の幅」ではなく「スロット幅+隙間」だけ離れている
          const step = containerWidth + SLOT_GAP;
          if (goNext) {
            translateX.value = withTiming(-step, { duration: SNAP_DURATION_MS }, (finished) => {
              if (finished) runOnJS(commitMonthChange)(1);
            });
          } else if (goPrev) {
            translateX.value = withTiming(step, { duration: SNAP_DURATION_MS }, (finished) => {
              if (finished) runOnJS(commitMonthChange)(-1);
            });
          } else {
            translateX.value = withTiming(0, { duration: SNAP_DURATION_MS });
          }
        }),
    [containerWidth, commitMonthChange, translateX],
  );

  const animatedTrackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value - (containerWidth + SLOT_GAP) }],
  }));

  const prev = addMonths(display.year, display.month, -1);
  const next = addMonths(display.year, display.month, 1);

  return (
    <View>
      {/* 曜日ラベル行はスライドするtrackの外、ここで固定表示1回だけ描画する。以前はMonthGrid内に
          あり3スロット分複製されていたため、ドラッグ中(指を離す前、まだ月境界を跨いだ位置)に
          隣り合う2つのスロットの断片が繋がって「本来存在しない曜日並び」に見える不具合があった
          （実機の画面録画で確認済み）。曜日は常にどの月でも同じ7列固定のため、そもそも月ごとに
          複製して一緒にスライドさせる必要が無い */}
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={label} style={[styles.weekdayLabel, weekdayLabelStyle(i)]}>
            {label}
          </Text>
        ))}
      </View>
      <GestureDetector gesture={panGesture}>
        <View onLayout={handleLayout} style={[styles.viewport, currentHeight > 0 && { height: currentHeight }]}>
          {containerWidth > 0 && (
            <Animated.View
              style={[styles.track, { width: containerWidth * 3 + SLOT_GAP * 2 }, animatedTrackStyle]}
            >
              <View style={{ width: containerWidth }}>
                <MonthGrid
                  year={prev.year}
                  month={prev.month}
                  today={today}
                  selectedDate={selectedDate}
                  onSelectDate={onSelectDate}
                  primaryCategoryByDay={primaryCategoryByDay}
                  categorySetByDay={categorySetByDay}
                  primaryCategoryByScheduleDay={primaryCategoryByScheduleDay}
                  categorySetByScheduleDay={categorySetByScheduleDay}
                  activeFilter={activeFilter}
                />
              </View>
              <View style={[styles.slotGap, currentHeight > 0 && { height: currentHeight }]} />
              <View style={{ width: containerWidth }}>
                <MonthGrid
                  year={display.year}
                  month={display.month}
                  today={today}
                  selectedDate={selectedDate}
                  onSelectDate={onSelectDate}
                  primaryCategoryByDay={primaryCategoryByDay}
                  categorySetByDay={categorySetByDay}
                  primaryCategoryByScheduleDay={primaryCategoryByScheduleDay}
                  categorySetByScheduleDay={categorySetByScheduleDay}
                  activeFilter={activeFilter}
                />
              </View>
              <View style={[styles.slotGap, currentHeight > 0 && { height: currentHeight }]} />
              <View style={{ width: containerWidth }}>
                <MonthGrid
                  year={next.year}
                  month={next.month}
                  today={today}
                  selectedDate={selectedDate}
                  onSelectDate={onSelectDate}
                  primaryCategoryByDay={primaryCategoryByDay}
                  categorySetByDay={categorySetByDay}
                  primaryCategoryByScheduleDay={primaryCategoryByScheduleDay}
                  categorySetByScheduleDay={categorySetByScheduleDay}
                  activeFilter={activeFilter}
                />
              </View>
            </Animated.View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: {
    ...Typography.caption,
    fontWeight: '700',
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: Colors.textPlaceholder,
    paddingVertical: 4,
  },
  sundayLabel: { color: Colors.danger },
  saturdayLabel: { color: Colors.accent },
  viewport: { overflow: 'hidden' },
  // alignItems:'flex-start'で各月をそれぞれの自然な高さのまま並べる（デフォルトのstretchだと
  // 3ヶ月のうち一番週数が多い月の高さに全部揃ってしまい、currentHeightの実測が意味を持たなくなる）
  track: { flexDirection: 'row', alignItems: 'flex-start' },
  // 背景色を明示しページ背景と同化させることで「余白」に見せる（隣接スロットとの
  // 境界を視覚的に断ち切るためのSLOT_GAP、詳細はSLOT_GAP定義のコメント参照）
  slotGap: { width: SLOT_GAP, backgroundColor: Colors.background },
});
