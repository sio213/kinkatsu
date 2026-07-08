import { Colors, Typography } from '@/constants/theme';
import { HeaderMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { NotFoundState } from '@/components/ui/not-found-state';
import { SectionHeading } from '@/components/ui/section-heading';
import { getGuide } from '@/lib/exercises/guides';
import { parseFormPoints } from '@/lib/exercises/form-points';
import { getExerciseImages } from '@/lib/exercises/images';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { getYoutubeSearchUrl } from '@/lib/exercises/youtube';
import { useExercise, useExercises } from '@/hooks/use-exercises';
import { useFavoriteToggle } from '@/hooks/use-favorite-toggle';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image } from 'expo-image';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;

function FormPointsList({ points }: { points: string[] }) {
  return (
    <>
      {points.map((p, i) => (
        <View key={i} style={styles.pointRow}>
          <Text style={styles.pointNumber}>{i + 1}</Text>
          <Text style={styles.pointText}>{p}</Text>
        </View>
      ))}
    </>
  );
}

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

// ExternalLinkを使わないのは、失敗時にAlertでユーザーに通知する必要があるため
async function handleYoutubeSearch(exerciseName: string) {
  try {
    await openBrowserAsync(getYoutubeSearchUrl(exerciseName), {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    });
  } catch (err) {
    console.error('[youtube search]', err);
    Alert.alert('エラー', 'ブラウザを開けませんでした。');
  }
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const push = useDebouncedPush();

  const { exercise, loaded } = useExercise(Number(id));
  const { toggleFavorite, removeExercise } = useExercises();
  const { localFav, toggle: handleFavoritePress } = useFavoriteToggle(
    exercise?.id,
    exercise?.favorite,
    toggleFavorite,
  );

  function handleEdit() {
    if (!exercise) return;
    push(`/exercise/edit/${exercise.id}`);
  }

  function handleDelete() {
    if (!exercise) return;
    Alert.alert('削除', `「${exercise.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeExercise(exercise.id);
            router.back();
          } catch (e) {
            console.error('[exercise delete]', e);
            Alert.alert('エラー', '削除に失敗しました。');
          }
        },
      },
    ]);
  }

  if (!loaded) return null;

  if (!exercise) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Stack.Screen options={{ title: '種目' }} />
        <NotFoundState
          message="種目が見つかりません"
          actionLabel="一覧に戻る"
          onPressAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const guide = getGuide(exercise);
  const formPoints = parseFormPoints(exercise.formPoints);
  const images = getExerciseImages(exercise);
  const hasContent = Boolean(guide) || Boolean(exercise.note) || formPoints.length > 0;

  const menuItems: DropdownMenuItem[] = [{ key: 'edit', label: '編集', icon: 'edit', onPress: handleEdit }];
  if (exercise.source === 'custom') {
    menuItems.push({ key: 'delete', label: '削除', icon: 'delete-outline', danger: true, onPress: handleDelete });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: exercise.name,
          headerRight: () => <HeaderMenu groups={[menuItems]} accessibilityLabel="種目のメニューを開く" />,
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.mediaBox}>
          {images.source != null ? (
            <Mp4Player source={images.source} />
          ) : (
            <Image source={images.thumbnail} style={styles.mediaThumbnail} contentFit="contain" />
          )}
          <TouchableOpacity
            style={styles.favoriteBadge}
            onPress={handleFavoritePress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={localFav ? 'お気に入り解除' : 'お気に入りに追加'}
          >
            <Text style={[styles.favoriteBadgeText, localFav && styles.favoriteBadgeTextActive]}>
              {localFav ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.section}>
            <SectionHeading>カテゴリ</SectionHeading>
            <View style={styles.categoryChip}>
              <Text style={styles.categoryText}>{getCategoryLabel(exercise.category)}</Text>
            </View>
          </View>

          {guide && (
            <>
              <View style={styles.section}>
                <SectionHeading>使う筋肉</SectionHeading>
                <Text style={styles.sectionBody}>{guide.muscle}</Text>
              </View>

              <View style={styles.section}>
                <SectionHeading>フォームのポイント</SectionHeading>
                <FormPointsList points={guide.points} />
              </View>

              <View style={styles.section}>
                <SectionHeading>よくあるミス</SectionHeading>
                <View style={styles.cautionBox}>
                  <Text style={styles.cautionText}>⚠️ {guide.caution}</Text>
                </View>
              </View>

              <View style={styles.section}>
                <SectionHeading>呼吸法</SectionHeading>
                <Text style={styles.sectionBody}>{guide.breath}</Text>
              </View>
            </>
          )}

          {!guide && formPoints.length > 0 && (
            <View style={styles.section}>
              <SectionHeading>フォームのポイント</SectionHeading>
              <FormPointsList points={formPoints} />
            </View>
          )}

          {exercise.note && (
            <View style={styles.section}>
              <SectionHeading>メモ</SectionHeading>
              <Text style={styles.sectionBody}>{exercise.note}</Text>
            </View>
          )}

          {!guide && !exercise.note && formPoints.length === 0 && (
            <Text style={styles.noGuide}>この種目の解説はまだありません</Text>
          )}

          <View style={[styles.youtubeSection, !hasContent && styles.youtubeSectionCentered]}>
            <TouchableOpacity
              style={styles.youtubeBtn}
              onPress={() => handleYoutubeSearch(exercise.name)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`${exercise.name}のフォーム動画をYouTubeで検索`}
            >
              <Text style={styles.youtubeBtnText}>YouTubeで検索</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  content: { paddingBottom: 48 },

  mediaBox: {
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    position: 'relative',
  },
  mediaThumbnail: {
    width: '54%',
    maxWidth: 180,
    aspectRatio: 1,
  },
  favoriteBadge: {
    position: 'absolute',
    top: 28,
    right: 28,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  favoriteBadgeText: { fontSize: 20, color: Colors.textPlaceholder },
  favoriteBadgeTextActive: { color: Colors.favorite },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
  },

  body: { paddingHorizontal: 20, paddingTop: 20, gap: 20 },

  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentSurface,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: { ...Typography.caption, color: Colors.accent, fontWeight: '600' },

  youtubeSection: {
    marginTop: 4,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  youtubeSectionCentered: {
    alignItems: 'center',
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  youtubeBtn: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  youtubeBtnText: { ...Typography.footnote, fontWeight: '600', color: Colors.accent },

  section: { gap: 8 },
  sectionBody: { ...Typography.longform, color: Colors.textBody },

  pointRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  pointNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accent,
    color: Colors.onAccent,
    ...Typography.badge,
    lineHeight: 22,
    textAlign: 'center',
  },
  pointText: { flex: 1, ...Typography.longform, color: Colors.textBody },

  cautionBox: {
    backgroundColor: Colors.warningSurface,
    borderRadius: 8,
    padding: 11,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warningAccent,
  },
  cautionText: { ...Typography.footnote, color: Colors.warningText },

  noGuide: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', paddingVertical: 24 },
});
