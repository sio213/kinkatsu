import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  onPress: () => void;
  // empty: 種目が1件も無い状態の大きな破線ボックス（説明文つき）。ghost: 種目が既にある状態の
  // 一覧末尾に置く控えめなボタン。compact: emptyと同じ破線ボックスだが説明文を持たない小型版
  // （カレンダー予定カードのように複数エントリが並ぶ中に1件だけ挟む用途、デザイン案
  // 「未来（予定）／種目0件」参照）
  variant: 'empty' | 'ghost' | 'compact';
  // カレンダー予定カード(components/calendar/schedule-exercise-card-group.tsx)は
  // 「「ベンチプレス 他1種目」夜19:30に種目を追加」のように予定を一意に特定するラベルが要るため、
  // 呼び出し元から上書きできるようにする。省略時は全variant共通で"種目を追加"のまま
  accessibilityLabel?: string;
  // 同上の理由でcompact移行前は個別に持っていたヒント文言（@reviewer指摘: compact化で
  // 消えていたa11yリグレッションの修正）。empty/ghostは元々ヒントを持たないため省略時は無し
  accessibilityHint?: string;
};

// ルーティンフォーム(components/routines/routine-form.tsx)・テンプレートセット編集画面
// (app/routine/exercise-edit.tsx)・予定の目標セット編集画面(app/calendar/schedule-workout-edit.tsx)・
// カレンダー選択日パネルの予定カード(components/calendar/schedule-exercise-card-group.tsx)で
// 共通の「種目を追加」ボタン。見た目が完全に同じため一箇所にまとめる（workout/add-exercise-button.tsx
// はセッション中の見た目が異なるため流用しない）
export function RoutineAddExerciseButton({ onPress, variant, accessibilityLabel = '種目を追加', accessibilityHint }: Props) {
  if (variant === 'empty') {
    return (
      <TouchableOpacity
        style={styles.addBtnEmpty}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        <DesignIcon name="add-circle" size={26} color={Colors.accent} />
        <Text style={styles.addBtnEmptyTitle}>種目を追加</Text>
        <Text style={styles.addBtnEmptyNote}>胸・肩・脚など自由に組み合わせ</Text>
      </TouchableOpacity>
    );
  }

  if (variant === 'compact') {
    return (
      <TouchableOpacity
        style={styles.addBtnCompact}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        <DesignIcon name="add-circle" size={24} color={Colors.accent} />
        <Text style={styles.addBtnCompactText}>種目を追加</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.addBtnGhost}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
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

  // デザイン案「未来（予定）／種目0件」準拠（破線ボックス+アイコン+1行テキストのみ、説明文なし）。
  // backgroundColorはaddBtnEmptyと同様に明示し、親の背景色に暗黙依存させない（@designer指摘）
  addBtnCompact: {
    width: '100%',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  addBtnCompactText: { ...Typography.footnote, fontWeight: '600', color: Colors.textMuted },

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
