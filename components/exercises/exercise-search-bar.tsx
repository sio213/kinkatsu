import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

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
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder="種目を検索..."
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
  searchInput: {
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    height: 40,
    paddingLeft: 36,
    paddingRight: 36,
    // heightに加えてpaddingVerticalも残し、テキストの縦位置をUIKit任せの自動センタリング
    // ではなくpaddingで固定する。iOSでは日本語IME変換中(カタカナ変換候補の下線表示等)の
    // 未確定文字がこちらの指定lineHeightより自然に背が高く描画されることがあり、
    // paddingを取り去ってheightだけで自動センタリングさせると、その一瞬だけ表示位置が
    // 下にずれて見えるため、paddingで位置を固定して吸収する
    paddingVertical: 9,
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.surfaceMuted,
    // Androidはグリフ種によってincludeFontPaddingの余白が変動し、入力するたびに
    // BOXの高さが揺れて見えるため、明示heightと合わせて無効化して固定する
    includeFontPadding: false,
  },
});
