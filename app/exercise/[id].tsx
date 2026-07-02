import { getGuide } from '@/lib/exercises/guides';
import { getExerciseImages } from '@/lib/exercises/images';
import { useExercise } from '@/hooks/use-exercises';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;

function Mp4Player({ source }: { source: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.media}
      contentFit="contain"
      nativeControls={false}
    />
  );
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { exercise, loaded } = useExercise(Number(id));

  if (!loaded) return null;

  if (!exercise) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="閉じる"
            onPress={() => router.back()}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>種目が見つかりません</Text>
          <TouchableOpacity style={styles.notFoundBackBtn} onPress={() => router.back()}>
            <Text style={styles.notFoundBackBtnText}>一覧に戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const guide = getGuide(exercise);
  const images = getExerciseImages(exercise);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="閉じる"
          onPress={() => router.back()}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {images && (
          <View style={styles.mediaBox}>
            <Mp4Player source={images.source} />
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.name}>{exercise.name}</Text>
            <View style={styles.categoryChip}>
              <Text style={styles.categoryText}>{exercise.category}</Text>
            </View>
          </View>

          {guide ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>使う筋肉</Text>
                <Text style={styles.sectionBody}>{guide.muscle}</Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>フォームのポイント</Text>
                {guide.points.map((p, i) => (
                  <View key={i} style={styles.pointRow}>
                    <Text style={styles.pointNumber}>{i + 1}</Text>
                    <Text style={styles.pointText}>{p}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>よくあるミス</Text>
                <View style={styles.cautionBox}>
                  <Text style={styles.cautionText}>⚠️ {guide.caution}</Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>呼吸法</Text>
                <Text style={styles.sectionBody}>{guide.breath}</Text>
              </View>
            </>
          ) : exercise.note ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>メモ</Text>
              <Text style={styles.sectionBody}>{exercise.note}</Text>
            </View>
          ) : (
            <Text style={styles.noGuide}>この種目の解説はまだありません</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 16, color: '#475569' },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
  notFoundText: { fontSize: 15, color: '#64748B' },
  notFoundBackBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  notFoundBackBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  content: { paddingBottom: 48 },

  mediaBox: {
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    paddingVertical: 16,
  },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
  },

  body: { paddingHorizontal: 20, paddingTop: 20, gap: 20 },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  name: { fontSize: 22, fontWeight: '700', color: '#1E293B', flex: 1 },
  categoryChip: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: { fontSize: 13, color: '#2563EB', fontWeight: '600' },

  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', letterSpacing: 0.5 },
  sectionBody: { fontSize: 15, color: '#334155', lineHeight: 22 },

  pointRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  pointNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563EB',
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  pointText: { flex: 1, fontSize: 15, color: '#334155', lineHeight: 22 },

  cautionBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  cautionText: { fontSize: 14, color: '#92400E', lineHeight: 20 },

  noGuide: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 24 },
});
