import { addMonths } from '@/lib/calendar/date-grid';
import { useCallback, useMemo, useState } from 'react';
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
export function SwipeableMonthView({ year, month, today, selectedDate, onSelectDate, onChangeMonth }: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useSharedValue(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // アニメーションが隣の月の位置まで完全にスナップし終えたタイミングでのみ呼ばれる。
  // ここでviewed stateを実際に切り替え、同じフレームでtranslateXを0に戻す
  // （切り替え後は「新しい当月」がちょうどこの位置に描画されるため、見た目のジャンプが起きない）
  const commitMonthChange = useCallback(
    (delta: number) => {
      onChangeMonth(delta);
      translateX.value = 0;
    },
    [onChangeMonth, translateX],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
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
      <View onLayout={handleLayout} style={styles.viewport}>
        {containerWidth > 0 && (
          <Animated.View style={[styles.track, { width: containerWidth * 3 }, animatedTrackStyle]}>
            <View style={{ width: containerWidth }}>
              <MonthGrid
                year={prev.year}
                month={prev.month}
                today={today}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
              />
            </View>
            <View style={{ width: containerWidth }}>
              <MonthGrid year={year} month={month} today={today} selectedDate={selectedDate} onSelectDate={onSelectDate} />
            </View>
            <View style={{ width: containerWidth }}>
              <MonthGrid
                year={next.year}
                month={next.month}
                today={today}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
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
  track: { flexDirection: 'row' },
});
