import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { EXERCISE_SORT_LABELS, type ExerciseSortBy } from '@/lib/exercises/constants';
import { useRef, useState } from 'react';
import { Dimensions, Keyboard, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

type Anchor = { x: number; y: number; width: number; height: number };

// 実際に選ぶ頻度が高い使用実績系の軸を上のグループに、機械的な軸を下のグループに分けて表示する
const SORT_MENU_GROUPS: ExerciseSortBy[][] = [
  ['frequent', 'recent'],
  ['name', 'category'],
];

type Props = {
  sortBy: ExerciseSortBy;
  onChange: (sortBy: ExerciseSortBy) => void;
};

// 種目一覧の並び替えドロップダウン。ExerciseCardMenuと同じくModal+measureInWindowで
// アンカー位置に絶対配置し、開閉のたびに背後のレイアウトがガタつかないようにする
export function ExerciseSortDropdown({ sortBy, onChange }: Props) {
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = anchor !== null;

  const handleOpen = () => {
    // 検索欄にフォーカスが残ったまま開くとキーボードが出しっぱなしになるため、
    // ExerciseCardMenuと同様に開く時点で明示的にフォーカスを外す
    Keyboard.dismiss();
    setAnchor({ x: 0, y: 0, width: 0, height: 0 });
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  };

  const handleClose = () => setAnchor(null);

  const handleSelect = (next: ExerciseSortBy) => {
    handleClose();
    if (next !== sortBy) onChange(next);
  };

  return (
    <>
      {/* collapsable={false}: Androidがスタイルなしのラッパーを最適化で消してしまい、
          measureInWindowが効かなくなるのを防ぐ */}
      <View ref={triggerRef} collapsable={false} style={styles.triggerWrapper}>
        <TouchableOpacity
          style={styles.trigger}
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityLabel={`並び替え: ${EXERCISE_SORT_LABELS[sortBy]}`}
          accessibilityState={{ expanded: open }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.triggerText}>並び替え: {EXERCISE_SORT_LABELS[sortBy]}</Text>
          <IconSymbol name={open ? 'chevron.up' : 'chevron.down'} size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable
          testID="exercise-sort-dropdown-backdrop"
          style={styles.backdrop}
          onPress={handleClose}
        />
        {anchor && (
          <View
            style={[
              styles.menu,
              { top: anchor.y + anchor.height + 4, right: SCREEN_WIDTH - (anchor.x + anchor.width) },
            ]}
          >
            {SORT_MENU_GROUPS.map((group) => (
              <View key={group.join('-')}>
                {group !== SORT_MENU_GROUPS[0] && <View style={styles.divider} />}
                {group.map((option) => {
                  const selected = option === sortBy;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.menuItem, selected && styles.menuItemSelected]}
                      onPress={() => handleSelect(option)}
                      accessibilityRole="radio"
                      accessibilityLabel={EXERCISE_SORT_LABELS[option]}
                      accessibilityState={{ checked: selected }}
                    >
                      <View style={styles.checkSlot}>
                        {selected && <IconSymbol name="checkmark" size={16} color={Colors.accent} />}
                      </View>
                      <Text style={[styles.menuItemText, selected && styles.menuItemTextSelected]}>
                        {EXERCISE_SORT_LABELS[option]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerWrapper: { alignSelf: 'flex-end' },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  triggerText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 4,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: 4 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  menuItemSelected: { backgroundColor: Colors.accentSurface },
  checkSlot: { width: 16, alignItems: 'center' },
  menuItemText: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  menuItemTextSelected: { color: Colors.accent, fontWeight: '600' },
});
