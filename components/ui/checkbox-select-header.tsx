import { Checkbox } from '@/components/ui/checkbox';
import { ContextBar } from '@/components/ui/context-bar';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  // 例:「種目」。「読み込む種目 3 / 5」のように件数表示の対象を差し込む
  itemLabel: string;
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
  // 件数表示の言い回し。'load'=「読み込む種目 3 / 5」（過去の記録から読み込む等）、
  // 'selection'=「3/4種目を選択中」（ルーティンを更新の差分確認）。
  // 帯・全選択トグル・タップ領域は同一なので、文言だけを出し分ける
  variant?: 'load' | 'selection';
};

// 「一覧から複数選ぶ→まとめて確定する」画面（過去の記録から読み込む、ルーティンから読み込む、
// ルーティンを更新の差分確認）で共通するヘッダー行（件数表示＋全選択トグル）。
// hooks/use-checkbox-selection.tsとセットで使う想定
export function CheckboxSelectHeader({
  itemLabel,
  selectedCount,
  totalCount,
  allSelected,
  onToggleAll,
  variant = 'load',
}: Props) {
  return (
    <ContextBar>
      {variant === 'selection' ? (
        <Text style={styles.headerCount}>
          <Text style={styles.headerCountValue}>{selectedCount}</Text>
          {`/${totalCount}${itemLabel}を選択中`}
        </Text>
      ) : (
        <Text style={styles.headerCount}>
          読み込む{itemLabel} <Text style={styles.headerCountValue}>{`${selectedCount} / ${totalCount}`}</Text>
        </Text>
      )}
      <TouchableOpacity
        style={styles.selectAll}
        onPress={onToggleAll}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allSelected }}
        accessibilityLabel="全選択"
      >
        <Checkbox checked={allSelected} />
        <Text style={styles.selectAllText}>全選択</Text>
      </TouchableOpacity>
    </ContextBar>
  );
}

const styles = StyleSheet.create({
  headerCount: { ...Typography.footnote, fontWeight: '700', color: Colors.textMuted },
  headerCountValue: { color: Colors.text },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  selectAllText: { ...Typography.footnote, fontWeight: '700', color: Colors.accent },
});
