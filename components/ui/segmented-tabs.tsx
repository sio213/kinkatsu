import { Colors, Shadows, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type SegmentedTabOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: readonly SegmentedTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // VoiceOver/TalkBackがタブ群全体を1つのまとまりとして読み上げられるようにする（「記録・解説の切り替え」等）
  accessibilityLabel?: string;
};

/**
 * 面（トラック）の上を選択中のタブが白いピルで移動するセグメント型のタブ切り替え。
 * 種目詳細の「記録／解説」で使う。CategoryFilterChips（横スクロールする絞り込みチップ）とは
 * 役割が違い、こちらは「画面の内容そのものを排他的に切り替える」ためのもの。
 *
 * 選択中のタブがsurface（白）なので、トラックがsurfaceSubtle（slate100）で背景の白から
 * 浮いていないと選択位置が読めない。そのため画面側で背景を塗り替えないこと。
 */
export function SegmentedTabs<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.item, isActive && styles.itemActive]}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option.label}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 9,
    padding: 3,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  itemActive: {
    backgroundColor: Colors.surface,
    ...Shadows.segmentedTab,
  },
  label: { ...Typography.footnote, fontWeight: '600', color: Colors.textSecondary },
  labelActive: { fontWeight: '700', color: Colors.textPrimary },
});
