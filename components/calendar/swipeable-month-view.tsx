import { addMonths } from '@/lib/calendar/date-grid';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MonthGrid } from './month-grid';

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
  dayCategories: Map<string, string>;
};

// このくらい動かした/このくらいの速度が出ていれば「月を切り替える意図」とみなすしきい値。
// 両方ともOR条件（どちらかを満たせば切り替え）にすることで、ゆっくり大きくドラッグしても・
// 素早くフリックしても、どちらでも自然に切り替わるようにする
const SWIPE_DISTANCE_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 800;
const SNAP_DURATION_MS = 240;

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
  dayCategories,
}: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  // 月ごとに4〜6週で行数が変わる（lib/calendar/date-grid.tsのweeksInMonthGrid）ため、
  // 3ヶ月分を横に並べたtrackの高さをそのままviewportに使うと「一番週数が多い月」の高さに
  // 固定され、週数の少ない月を見ている間は下に余白ができてしまう。currentHeightで
  // 「今表示中(=中央)の月」だけの実測高さをviewportへ明示的に適用し、それ以外は
  // overflow:hiddenで切り詰めることで、常に表示中の月にぴったり合った高さにする
  const [currentHeight, setCurrentHeight] = useState(0);
  const translateX = useSharedValue(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);
  const handleCurrentMonthLayout = useCallback((e: LayoutChangeEvent) => {
    setCurrentHeight(e.nativeEvent.layout.height);
  }, []);

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
  // 元々0のままなので、ここでの再代入は無害
  useLayoutEffect(() => {
    translateX.value = 0;
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
          if (goNext) {
            translateX.value = withTiming(-containerWidth, { duration: SNAP_DURATION_MS }, (finished) => {
              if (finished) runOnJS(commitMonthChange)(1);
            });
          } else if (goPrev) {
            translateX.value = withTiming(containerWidth, { duration: SNAP_DURATION_MS }, (finished) => {
              if (finished) runOnJS(commitMonthChange)(-1);
            });
          } else {
            translateX.value = withTiming(0, { duration: SNAP_DURATION_MS });
          }
        }),
    [containerWidth, commitMonthChange, translateX],
  );

  const animatedTrackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value - containerWidth }],
  }));

  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);

  return (
    <GestureDetector gesture={panGesture}>
      <View onLayout={handleLayout} style={[styles.viewport, currentHeight > 0 && { height: currentHeight }]}>
        {containerWidth > 0 && (
          <Animated.View style={[styles.track, { width: containerWidth * 3 }, animatedTrackStyle]}>
            <View style={{ width: containerWidth }}>
              <MonthGrid
                year={prev.year}
                month={prev.month}
                today={today}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
                dayCategories={dayCategories}
              />
            </View>
            <View style={{ width: containerWidth }} onLayout={handleCurrentMonthLayout}>
              <MonthGrid
                year={year}
                month={month}
                today={today}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
                dayCategories={dayCategories}
              />
            </View>
            <View style={{ width: containerWidth }}>
              <MonthGrid
                year={next.year}
                month={next.month}
                today={today}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
                dayCategories={dayCategories}
              />
            </View>
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
  // alignItems:'flex-start'で各月をそれぞれの自然な高さのまま並べる（デフォルトのstretchだと
  // 3ヶ月のうち一番週数が多い月の高さに全部揃ってしまい、currentHeightの実測が意味を持たなくなる）
  track: { flexDirection: 'row', alignItems: 'flex-start' },
});
