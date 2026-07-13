import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  onPress: () => void;
  // empty: 種目が1件も無い状態の大きな破線ボックス。ghost: 種目が既にある状態の一覧末尾に置く控えめなボタン
  variant: 'empty' | 'ghost';
};

// ルーティンフォーム(components/routines/routine-form.tsx)とテンプレートセット編集画面
// (app/routine/exercise-edit.tsx)の両方に出る「種目を追加」ボタン。見た目が完全に同じため
// 一箇所にまとめる（workout/add-exercise-button.tsxはセッション中の見た目が異なるため流用しない）
export function RoutineAddExerciseButton({ onPress, variant }: Props) {
  if (variant === 'empty') {
    return (
      <TouchableOpacity
        style={styles.addBtnEmpty}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="種目を追加"
      >
        <DesignIcon name="add-circle" size={26} color={Colors.accent} />
        <Text style={styles.addBtnEmptyTitle}>種目を追加</Text>
        <Text style={styles.addBtnEmptyNote}>胸・肩・脚など自由に組み合わせ</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.addBtnGhost}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="種目を追加"
    >
      <DesignIcon name="add-circle" size={18} color={Colors.accent} />
      <Text style={styles.addBtnGhostText}>種目を追加</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  addBtnEmpty: {
    width: '100%',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 6,
  },
  addBtnEmptyTitle: { ...Typography.bodyStrong, color: Colors.textPrimary },
  addBtnEmptyNote: { ...Typography.caption, color: Colors.textMuted },

  addBtnGhost: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    backgroundColor: Colors.accentSurface,
    borderRadius: 8,
    paddingVertical: 11,
  },
  addBtnGhostText: { ...Typography.footnote, fontWeight: '600', color: Colors.accent },
});
