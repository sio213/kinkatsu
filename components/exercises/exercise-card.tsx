import type { Exercise } from '@/db/schema';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ExerciseForm, type ExerciseFormValues } from './exercise-form';

type Props = {
  exercise: Exercise;
  isEditing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: (favorite: boolean) => void;
  onSubmit: (values: ExerciseFormValues) => void;
};

export function ExerciseCard({
  exercise: e,
  isEditing,
  onEdit,
  onCloseEdit,
  onDelete,
  onToggleFavorite,
  onSubmit,
}: Props) {
  return (
    <View>
      <View style={styles.card}>
        <View style={styles.cardMain}>
          <View style={styles.info}>
            <Text style={styles.name}>{e.name}</Text>
            <View style={styles.meta}>
              <View style={styles.categoryChip}>
                <Text style={styles.categoryText}>{e.category}</Text>
              </View>
              {e.note ? (
                <Text style={styles.note} numberOfLines={1}>
                  {e.note}
                </Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => onToggleFavorite(!e.favorite)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={e.favorite ? 'お気に入り解除' : 'お気に入りに追加'}
          >
            <Text style={[styles.star, e.favorite && styles.starActive]}>
              {e.favorite ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={isEditing ? onCloseEdit : onEdit}
            accessibilityLabel={isEditing ? '編集を閉じる' : `${e.name}を編集`}
          >
            <Text style={styles.actionBtnText}>{isEditing ? '閉じる' : '編集'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={onDelete}
            accessibilityLabel={`${e.name}を削除`}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>削除</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isEditing && (
        <View style={styles.editWrapper}>
          <Text style={styles.editTitle}>種目を編集</Text>
          <ExerciseForm
            initial={{ name: e.name, category: e.category, note: e.note }}
            onSubmit={onSubmit}
            onCancel={onCloseEdit}
            submitLabel="保存"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryChip: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
  note: { fontSize: 12, color: '#94A3B8', flex: 1 },

  star: { fontSize: 20, color: '#CBD5E1' },
  starActive: { color: '#F59E0B' },

  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
  },
  actionBtnText: { fontSize: 13, color: '#334155', fontWeight: '500' },
  actionBtnDanger: { backgroundColor: '#FEE2E2' },
  actionBtnDangerText: { color: '#DC2626' },

  editWrapper: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  editTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
});
