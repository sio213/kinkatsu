import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 仮実装。「過去のトレーニングを選ぶ」画面（session-history-picker.tsx）からのルーティングを
// 先に成立させるためのプレースホルダーで、本実装（読み込む種目を選ぶ画面）は後続PRで追加する
export default function SessionHistoryLoadScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <NotFoundState message="準備中です" actionLabel="戻る" onPressAction={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
