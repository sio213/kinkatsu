import { DesignIcon } from '@/components/ui/design-icon';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Colors, Typography } from '@/constants/theme';
import { EXERCISE_SORT_LABELS, type ExerciseSortBy } from '@/lib/exercises/constants';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

// 実際に選ぶ頻度が高い使用実績系の軸を上のグループに、機械的な軸を下のグループに分けて表示する
const SORT_MENU_GROUPS: ExerciseSortBy[][] = [
  ['frequent', 'recent'],
  ['name', 'category'],
];

type Props = {
  sortBy: ExerciseSortBy;
  onChange: (sortBy: ExerciseSortBy) => void;
};

// 種目一覧の並び替えドロップダウン
export function ExerciseSortDropdown({ sortBy, onChange }: Props) {
  const groups: DropdownMenuItem[][] = SORT_MENU_GROUPS.map((group) =>
    group.map((option) => ({
      key: option,
      label: EXERCISE_SORT_LABELS[option],
      selected: option === sortBy,
      onPress: () => {
        if (option !== sortBy) onChange(option);
      },
    })),
  );

  return (
    <DropdownMenu
      groups={groups}
      minWidth={180}
      backdropTestID="exercise-sort-dropdown-backdrop"
      renderTrigger={({ open, onPress }) => (
        <TouchableOpacity
          style={styles.trigger}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`並び替え: ${EXERCISE_SORT_LABELS[sortBy]}`}
          accessibilityState={{ expanded: open }}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <Text style={styles.triggerText}>並び替え: {EXERCISE_SORT_LABELS[sortBy]}</Text>
          <DesignIcon name={open ? 'expand-less' : 'expand-more'} size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignSelf: 'flex-end',
  },
  triggerText: { ...Typography.footnote, fontWeight: '600', color: Colors.textMuted },
});
