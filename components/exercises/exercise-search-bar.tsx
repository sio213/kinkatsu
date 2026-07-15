import { BoxedTextInput } from '@/components/ui/boxed-text-input';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
};

export function ExerciseSearchBar({ value, onChangeText, onSubmitEditing }: Props) {
  return (
    <View style={styles.searchWrapper}>
      <View style={styles.searchIconWrapper}>
        <IconSymbol name="magnifyingglass" size={18} color={Colors.textPlaceholder} />
      </View>
      <BoxedTextInput
        height={40}
        boxStyle={styles.searchBox}
        style={styles.searchText}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder="種目を検索"
        accessibilityLabel="種目を検索"
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
      {Platform.OS !== 'ios' && value.length > 0 && (
        <TouchableOpacity
          style={styles.searchClearBtn}
          onPress={() => onChangeText('')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="検索文字をクリア"
        >
          <IconSymbol name="xmark.circle.fill" size={18} color={Colors.textPlaceholder} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrapper: { position: 'relative', justifyContent: 'center' },
  searchIconWrapper: {
    position: 'absolute',
    left: 11,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
  searchClearBtn: {
    position: 'absolute',
    right: 11,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
  // border/borderColor/borderRadiusはBoxedTextInputの既定値のまま。背景色だけ
  // 検索欄用のsurfaceMutedに上書きする。paddingRightは、Androidだけ自前のクリアボタン
  // (searchClearBtn)分の余白を確保する。iOSのclearButtonMode="while-editing"はTextInput
  // 自身の内側(＝この余白を引いた範囲)に描画されるため、Androidと同じ36を指定すると
  // ネイティブのクリアボタンが箱の右端よりかなり内側(中央寄り)にずれて見えてしまう
  searchBox: {
    paddingLeft: 36,
    paddingRight: Platform.OS === 'ios' ? 11 : 36,
    backgroundColor: Colors.surfaceMuted,
  },
  searchText: Typography.body,
});
