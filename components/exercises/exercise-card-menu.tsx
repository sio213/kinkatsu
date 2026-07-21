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
  // 「過去の記録から読み込み」項目。セッションの概念が無い文脈（直接予定の目標セット編集画面、
  // 2026-07-20）では読み込み元が無いため省略でき、その場合この項目自体を出さない
  onLoadFromHistory?: () => void;
  // この種目に読み込める過去記録が1件も無ければ「上へ移動」等と同じくグレーアウトする。
  // onLoadFromHistory省略時は無視される
  hasHistory?: boolean;
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
    ...(onLoadFromHistory
      ? [
          {
            key: 'history',
            label: '過去の記録から読み込み',
            icon: 'history' as const,
            disabled: !hasHistory,
            hint: !hasHistory ? 'この種目の過去の記録がありません' : undefined,
            onPress: onLoadFromHistory,
          },
        ]
      : []),
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
