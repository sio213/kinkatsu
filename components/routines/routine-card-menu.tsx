import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { TouchableOpacity } from 'react-native';

type Props = {
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
};

// ルーティン一覧カードの「⋮」メニュー（編集/複製/上へ移動/下へ移動/削除）。
// components/workout/exercise-card-menu.tsxと同じDropdownMenuの使い方に揃える。
// 内容操作系(編集/複製)・並び替え系(上/下)・破壊操作(削除)でグループを分け、
// 削除の誤タップを防ぐ（@designerレビュー）
export function RoutineCardMenu({ isFirst, isLast, onEdit, onDuplicate, onMoveUp, onMoveDown, onDelete }: Props) {
  const groups: DropdownMenuItem[][] = [
    [
      { key: 'edit', label: '編集', icon: 'edit', onPress: onEdit },
      { key: 'duplicate', label: '複製', icon: 'content-copy', onPress: onDuplicate },
    ],
    [
      { key: 'up', label: '上へ移動', icon: 'arrow-upward', disabled: isFirst, onPress: onMoveUp },
      { key: 'down', label: '下へ移動', icon: 'arrow-downward', disabled: isLast, onPress: onMoveDown },
    ],
    [{ key: 'delete', label: '削除', icon: 'delete-outline', danger: true, onPress: onDelete }],
  ];

  return (
    <DropdownMenu
      groups={groups}
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
