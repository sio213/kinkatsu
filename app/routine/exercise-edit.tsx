import { RoutineAddExerciseButton } from '@/components/routines/routine-add-exercise-button';
import { RoutineTemplateExerciseCard } from '@/components/routines/routine-template-exercise-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ルーティンの下書き（useRoutineDraftStore）にある全種目をまとめて編集する画面。
// 種目の追加・並び順はルーティンフォーム側で行い、この画面はセットの追加・削除・値編集と
// 種目単体の削除（⋮メニュー）に専念する。保存操作の実体は無く、「保存」ボタンは
// 編集内容が既にドラフトストアへ即時反映済みであることを踏まえた見た目上の確定＝戻る動作
export default function RoutineExerciseEditScreen() {
  const router = useRouter();
  const exercises = useRoutineDraftStore((state) => state.exercises);
  const keyboardInset = useKeyboardInset();

  const handleAddExercise = useCallback(() => {
    router.push('/routine/exercise-picker');
  }, [router]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInset={{ bottom: keyboardInset }}
        scrollIndicatorInsets={{ bottom: keyboardInset }}
        keyboardShouldPersistTaps="handled"
      >
        {exercises.length === 0 ? (
          <RoutineAddExerciseButton variant="empty" onPress={handleAddExercise} />
        ) : (
          <View style={styles.list}>
            {exercises.map((exercise, index) => (
              <RoutineTemplateExerciseCard key={`${exercise.exerciseId}-${index}`} exercise={exercise} index={index} />
            ))}
            <RoutineAddExerciseButton variant="ghost" onPress={handleAddExercise} />
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label="保存" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },

  list: { gap: 10 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
