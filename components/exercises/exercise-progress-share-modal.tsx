import { ExerciseProgressShareCard } from '@/components/exercises/exercise-progress-share-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import type { HighlightKind } from '@/lib/exercises/chart-layout';
import type { ProgressLeadIn, ProgressPoint, ProgressUnit } from '@/lib/exercises/progress';
import { shareProgressCard, type ProgressShareSummary } from '@/lib/share/progress-share';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  summary: ProgressShareSummary;
  periodLabel: string;
  isPersonalBest: boolean;
  points: ProgressPoint[];
  chartUnit: ProgressUnit;
  highlight: ProgressPoint | null;
  highlightKind: HighlightKind;
  leadIn: ProgressLeadIn | null;
};

/**
 * 共有カードのプレビュー。何が共有されるかを見せてから共有シートを開く。
 *
 * プレビューを挟むのは体験のためだけでなく技術的な要請でもある——キャプチャ対象のViewは
 * 実際に画面に描かれている必要があり、裏で描くと空の画像になりうる（共有カード側のコメント参照）。
 */
export function ExerciseProgressShareModal({
  visible,
  onClose,
  summary,
  periodLabel,
  isPersonalBest,
  points,
  chartUnit,
  highlight,
  highlightKind,
  leadIn,
}: Props) {
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    setSharing(true);
    try {
      const result = await shareProgressCard(cardRef, summary);
      // 共有シートを閉じただけのときはモーダルを残す（もう一度押せる）
      if (result === 'shared') onClose();
    } catch (error) {
      console.error('共有に失敗しました', error);
      Alert.alert('共有できませんでした', '画像の書き出しに失敗しました。もう一度お試しください。');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* 背景のタップで閉じる。共有中は押しても閉じない（キャプチャ中にViewが消えるのを防ぐ） */}
      <Pressable style={styles.backdrop} onPress={sharing ? undefined : onClose}>
        {/* カード側へタップを伝播させない */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.heading}>この画像を共有します</Text>

          <ExerciseProgressShareCard
            ref={cardRef}
            exerciseName={summary.exerciseName}
            periodLabel={periodLabel}
            metricLabel={summary.metricLabel}
            value={summary.value}
            unit={summary.unit}
            isPersonalBest={isPersonalBest}
            points={points}
            chartUnit={chartUnit}
            highlight={highlight}
            highlightKind={highlightKind}
            leadIn={leadIn}
          />

          <Text style={styles.note}>
            ハッシュタグはクリップボードにもコピーされます。投稿欄に入らなかったときは貼り付けてください
          </Text>

          <View style={styles.actions}>
            {sharing ? (
              <ActivityIndicator color={Colors.accent} style={styles.spinner} />
            ) : (
              <PrimaryButton label="共有する" onPress={handleShare} style={styles.shareButton} />
            )}
            <Pressable onPress={onClose} disabled={sharing} accessibilityRole="button">
              <Text style={[styles.cancel, sharing && styles.cancelDisabled]}>閉じる</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    alignItems: 'center',
  },
  heading: { ...Typography.cardTitle, color: Colors.textPrimary },
  note: {
    ...Typography.captionCompact,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: { alignSelf: 'stretch', alignItems: 'center', gap: 12 },
  shareButton: { alignSelf: 'stretch' },
  // ボタンと入れ替わるので、同じ高さを確保して並びが跳ねないようにする
  spinner: { height: 48 },
  cancel: { ...Typography.bodyStrong, color: Colors.textSecondary },
  cancelDisabled: { color: Colors.textPlaceholder },
});
