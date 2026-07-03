import { IconSymbol } from '@/components/ui/icon-symbol';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RecordScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <Text style={styles.title}>記録</Text>
        </View>

        <View style={styles.empty}>
          <IconSymbol name="list.bullet.clipboard" size={40} color="#CBD5E1" />
          <Text style={styles.emptyText}>トレーニング記録機能は準備中です</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 16 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1E293B' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },
});
