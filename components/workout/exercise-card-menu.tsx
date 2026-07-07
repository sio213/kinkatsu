import { DesignIcon } from '@/components/ui/design-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useRef, useState } from 'react';
import { Dimensions, Keyboard, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

type Anchor = { x: number; y: number; width: number; height: number };

type Props = {
  isFirst: boolean;
  isLast: boolean;
  onSwap: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onLoadFromHistory: () => void;
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
  onDelete,
}: Props) {
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = anchor !== null;

  const handleOpen = () => {
    // 親のFlatListはkeyboardShouldPersistTaps="handled"のため、フォーカス中の数値入力欄が
    // あってもこのボタンのタップだけではフォーカスが外れない。フォーカスが残ったまま
    // 「種目を入れ替え」「過去の記録から読み込む」で他画面へ遷移して戻ると、その入力欄まで
    // 自動スクロールしてしまう不具合があったため、メニューを開く時点で明示的にフォーカスを外す
    Keyboard.dismiss();
    // measureInWindowは非同期（ネイティブブリッジ経由）のため、先に暫定位置でメニューを開いてから
    // 実際の位置に更新する。ネイティブ環境ではほぼ同一フレーム内に解決され体感できるズレは生じない
    setAnchor({ x: 0, y: 0, width: 0, height: 0 });
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  };

  const handleClose = () => setAnchor(null);

  const handleSwap = () => {
    handleClose();
    onSwap();
  };

  const handleMoveUp = () => {
    handleClose();
    onMoveUp();
  };

  const handleMoveDown = () => {
    handleClose();
    onMoveDown();
  };

  const handleLoadFromHistory = () => {
    handleClose();
    onLoadFromHistory();
  };

  const handleDelete = () => {
    handleClose();
    onDelete();
  };

  return (
    <>
      {/* collapsable={false}: Androidがスタイルなしのラッパーを最適化で消してしまい、
          measureInWindowが効かなくなるのを防ぐ */}
      <View ref={triggerRef} collapsable={false}>
        <TouchableOpacity
          onPress={handleOpen}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          accessibilityRole="button"
          accessibilityLabel="メニューを開く"
          accessibilityState={{ expanded: open }}
        >
          <IconSymbol name="ellipsis" size={20} color={open ? Colors.accent : Colors.textPlaceholder} />
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        {anchor && (
          <View
            style={[
              styles.menu,
              { top: anchor.y + anchor.height + 4, right: SCREEN_WIDTH - (anchor.x + anchor.width) },
            ]}
          >
            <TouchableOpacity style={styles.menuItem} onPress={handleSwap} accessibilityLabel="種目を入れ替え">
              <DesignIcon name="swap-horiz" size={18} color={Colors.textMuted} />
              <Text style={styles.menuItemText}>種目を入れ替え</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleMoveUp}
              disabled={isFirst}
              accessibilityLabel="上へ移動"
              accessibilityState={{ disabled: isFirst }}
            >
              <DesignIcon
                name="arrow-upward"
                size={18}
                color={isFirst ? Colors.textPlaceholder : Colors.textMuted}
              />
              <Text style={[styles.menuItemText, isFirst && styles.menuItemDisabled]}>上へ移動</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleMoveDown}
              disabled={isLast}
              accessibilityLabel="下へ移動"
              accessibilityState={{ disabled: isLast }}
            >
              <DesignIcon
                name="arrow-downward"
                size={18}
                color={isLast ? Colors.textPlaceholder : Colors.textMuted}
              />
              <Text style={[styles.menuItemText, isLast && styles.menuItemDisabled]}>下へ移動</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleLoadFromHistory}
              accessibilityLabel="過去の記録から読み込む"
            >
              <DesignIcon name="history" size={18} color={Colors.textMuted} />
              <Text style={styles.menuItemText}>過去の記録から読み込む</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete} accessibilityLabel="削除">
              <DesignIcon name="delete-outline" size={18} color={Colors.danger} />
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>削除</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, paddingHorizontal: 10 },
  menuItemText: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  menuItemDisabled: { color: Colors.textPlaceholder },
  menuItemDanger: { color: Colors.danger },
});
