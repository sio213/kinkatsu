import { Colors } from '@/constants/theme';
import { DesignIcon } from '@/components/ui/design-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
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
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image } from 'expo-image';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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

function Mp4Player({ source, thumbnail }: { source: number; thumbnail: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // statusChangeイベントを監視し、動画本体が再生可能になるまではサムネイル+スピナーを重ねて表示する
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const isReady = status === 'readyToPlay';
  const isError = status === 'error';

  return (
    <View style={styles.media}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="contain"
        nativeControls={false}
      />
      {!isReady && (
        <View style={styles.videoOverlay} pointerEvents="none">
          <Image source={thumbnail} style={styles.mediaThumbnail} contentFit="contain" />
          {isError ? (
            <Text style={styles.videoErrorText} accessibilityRole="alert">
              ⚠️ 動画を読み込めませんでした
            </Text>
          ) : (
            <ActivityIndicator
              size="small"
              color={Colors.accent}
              accessibilityLabel="動画を読み込み中"
            />
          )}
        </View>
      )}
    </View>
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
  const headerHeight = useHeaderHeight();

  const { exercise, loaded } = useExercise(Number(id));
  const { toggleFavorite, removeExercise } = useExercises();
  const { localFav, toggle: handleFavoritePress } = useFavoriteToggle(
    exercise?.id,
    exercise?.favorite,
    toggleFavorite,
  );

  const [menuOpen, setMenuOpen] = useState(false);

  function handleEdit() {
    if (!exercise) return;
    setMenuOpen(false);
    push(`/exercise/edit/${exercise.id}`);
  }

  function handleDelete() {
    if (!exercise) return;
    setMenuOpen(false);
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

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: exercise.name,
          headerRight: () => (
            <TouchableOpacity
              style={styles.menuTrigger}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="メニューを開く"
              accessibilityRole="button"
              accessibilityState={{ expanded: menuOpen }}
              onPress={() => setMenuOpen((v) => !v)}
            >
              <IconSymbol
                name="ellipsis"
                size={22}
                color={menuOpen ? Colors.accent : Colors.textPlaceholder}
              />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Modalで独立レイヤーに描画することで、ScrollViewとの描画順の衝突を避ける */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
        <View style={[styles.menu, { top: headerHeight, right: 16 }]}>
          <TouchableOpacity style={styles.menuItem} onPress={handleEdit} accessibilityLabel="編集">
            <DesignIcon name="edit" size={18} color={Colors.textMuted} />
            <Text style={styles.menuItemText}>編集</Text>
          </TouchableOpacity>
          {exercise.source === 'custom' && (
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete} accessibilityLabel="削除">
              <DesignIcon name="delete-outline" size={18} color={Colors.danger} />
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>削除</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.mediaBox}>
          {images.source != null ? (
            <Mp4Player source={images.source} thumbnail={images.thumbnail} />
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

  menuTrigger: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuBackdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 4,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  menuItemText: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  menuItemDanger: { color: Colors.danger },

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
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  videoErrorText: {
    fontSize: 13,
    color: Colors.textBody,
    paddingHorizontal: 24,
    textAlign: 'center',
  },

  body: { paddingHorizontal: 20, paddingTop: 20, gap: 20 },

  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentSurface,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: { fontSize: 11.5, color: Colors.accent, fontWeight: '600' },

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
  youtubeBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accent },

  section: { gap: 8 },
  sectionBody: { fontSize: 14, color: Colors.textBody, lineHeight: 22 },

  pointRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  pointNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accent,
    color: Colors.onAccent,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  pointText: { flex: 1, fontSize: 14, color: Colors.textBody, lineHeight: 22 },

  cautionBox: {
    backgroundColor: Colors.warningSurface,
    borderRadius: 8,
    padding: 11,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warningAccent,
  },
  cautionText: { fontSize: 13, color: Colors.warningText, lineHeight: 19.5 },

  noGuide: { fontSize: 14, color: Colors.textPlaceholder, textAlign: 'center', paddingVertical: 24 },
});
