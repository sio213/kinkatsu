import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  onPress: () => void;
  // ghost: 種目が既にある状態の一覧末尾に置く控えめなボタン。compact: 種目0件時の破線ボックス
  // （カレンダー予定カードのように複数エントリが並ぶ中に1件だけ挟む用途、デザイン案
  // 「未来（予定）／種目0件」参照）。かつて存在した種目0件用のvariant="empty"（破線ボックス+
  // 説明文つき）は2026-07-22に廃止し、components/workout/exercise-empty-state.tsxの
  // ExerciseEmptyStateに統一した（@ユーザー指摘: 種目0件の空状態はトレーニング画面のデザインに
  // 揃えるべきだった）
  variant: 'ghost' | 'compact';
  // カレンダー予定カード(components/calendar/schedule-exercise-card-group.tsx)は
  // 「「ベンチプレス 他1種目」夜19:30に種目を追加」のように予定を一意に特定するラベルが要るため、
  // 呼び出し元から上書きできるようにする。省略時は全variant共通で"種目を追加"のまま
  accessibilityLabel?: string;
  // 同上の理由でcompact移行前は個別に持っていたヒント文言（@reviewer指摘: compact化で
  // 消えていたa11yリグレッションの修正）。ghostは元々ヒントを持たないため省略時は無し
  accessibilityHint?: string;
};

// ルーティンフォーム(components/routines/routine-form.tsx)・テンプレートセット編集画面
// (app/routine/exercise-edit.tsx)・予定の目標セット編集画面(app/calendar/schedule-workout-edit.tsx)の
// 一覧末尾ボタン(variant="ghost")、およびカレンダー選択日パネルの予定カード
// (components/calendar/schedule-exercise-card-group.tsx)の種目0件表示(variant="compact")で
// 共通の「種目を追加」ボタン
export function RoutineAddExerciseButton({ onPress, variant, accessibilityLabel = '種目を追加', accessibilityHint }: Props) {
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
  // デザイン案「未来（予定）／種目0件」準拠（破線ボックス+アイコン+1行テキストのみ、説明文なし）。
  // backgroundColorは親の背景色に暗黙依存させないよう明示している（@designer指摘）
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
