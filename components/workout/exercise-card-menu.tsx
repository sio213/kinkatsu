import { IconSymbol } from '@/components/ui/icon-symbol';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Colors } from '@/constants/theme';
import { TouchableOpacity } from 'react-native';

type Props = {
  isFirst: boolean;
  isLast: boolean;
  onSwap: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onLoadFromHistory: () => void;
  // この種目に読み込める過去記録が1件も無ければ「上へ移動」等と同じくグレーアウトする
  hasHistory: boolean;
  onDelete: () => void;
};

// 種目カードの「⋮」メニュー
export function ExerciseCardMenu({
  isFirst,
  isLast,
  onSwap,
  onMoveUp,
  onMoveDown,
  onLoadFromHistory,
  hasHistory,
  onDelete,
}: Props) {
  const items: DropdownMenuItem[] = [
    { key: 'swap', label: '種目を入れ替え', icon: 'swap-horiz', onPress: onSwap },
    { key: 'up', label: '上へ移動', icon: 'arrow-upward', disabled: isFirst, onPress: onMoveUp },
    { key: 'down', label: '下へ移動', icon: 'arrow-downward', disabled: isLast, onPress: onMoveDown },
    {
      key: 'history',
      label: '過去の記録から読み込む',
      icon: 'history',
      disabled: !hasHistory,
      hint: !hasHistory ? 'この種目の過去の記録がありません' : undefined,
      onPress: onLoadFromHistory,
    },
    { key: 'delete', label: '削除', icon: 'delete-outline', danger: true, onPress: onDelete },
  ];

  return (
    <DropdownMenu
      groups={[items]}
      minWidth={160}
      renderTrigger={({ open, onPress }) => (
        <TouchableOpacity
          onPress={onPress}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          accessibilityRole="button"
          accessibilityLabel="メニューを開く"
          accessibilityState={{ expanded: open }}
        >
          <IconSymbol name="ellipsis" size={20} color={open ? Colors.accent : Colors.textPlaceholder} />
        </TouchableOpacity>
      )}
    />
  );
}
