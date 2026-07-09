import { Colors, Shadows } from '@/constants/theme';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';

const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const KNOB_SIZE = 27;
const TRACK_PADDING = 2;
const KNOB_TRAVEL = TRACK_WIDTH - KNOB_SIZE - TRACK_PADDING * 2;

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

// DS準拠の共通on/offトグル。RN標準のSwitchはOS依存でサイズ・色・影を指定通りに再現できないため自前実装する
export function Switch({ value, onValueChange, disabled, accessibilityLabel }: Props) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    // トラックのbackgroundColor補間がネイティブドライバー非対応のため、同じprogress値を使うtransformもJSドライバー固定にしている
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 160,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start();
  }, [value, progress]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.borderStrong, Colors.accent],
  });
  const knobTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, KNOB_TRAVEL],
  });

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
      style={[styles.track, disabled && styles.disabled]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.trackFill, { backgroundColor: trackColor }]} />
      <Animated.View
        style={[styles.knob, Shadows.switchKnob, { transform: [{ translateX: knobTranslateX }] }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: TRACK_PADDING,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  trackFill: {
    borderRadius: TRACK_HEIGHT / 2,
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: Colors.surface,
  },
});
