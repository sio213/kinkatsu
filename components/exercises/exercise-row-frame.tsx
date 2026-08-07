import { CategoryChip } from '@/components/exercises/category-chip';
import { ExerciseThumbnail } from '@/components/exercises/exercise-thumbnail';
import { Colors, Typography } from '@/constants/theme';
import { getExerciseImages } from '@/lib/exercises/images';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type ContentPress = {
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityState?: { expanded?: boolean };
};

type Props = {
  // チェックボックスの見た目とタップ可否は呼び出し側が決める。行全体をチェックのタップ領域に
  // する画面（読み込み系）はCheckboxをそのまま渡し、チェックだけを独立させる画面
  // （ルーティンを更新の差分確認）はTouchableOpacityでくるんで渡す
  checkbox: ReactNode;
  name: string;
  category: string;
  source: string;
  slug: string | null;
  // 名前の下に置く要約。1行のテキストでも複数行の比較でもよい
  body: ReactNode;
  // 名前・カテゴリの右端に置く要素（アコーディオンのシェブロン等）
  trailing?: ReactNode;
  // 内容部（サムネ〜本文）を押したときの動作。渡さなければ非タップ
  content?: ContentPress;
  // 行の左右パディング。読み込み系はFlatListのcontentContainerが左右16pxを持つため0でよいが、
  // 差分確認画面はアコーディオンの展開部を画面幅いっぱいに敷くため行側で持つ
  horizontalPadding?: number;
  // 展開部を含めて1つの塊として囲む側が線を引く場合に消す
  hideBorder?: boolean;
  // チェックボックス／サムネ／本文の間隔と、本文2行の間隔。既定は読み込み系の値
  gap?: number;
  infoGap?: number;
  // 本文が2行以上ある行（差分確認画面の「ルーティン／今日」）は、チェックとサムネを
  // 上揃えにして1行目の文字と光学的に揃える
  alignItems?: 'center' | 'flex-start';
};

/**
 * 「チェックボックス＋サムネイル＋名前＋カテゴリ＋要約」の行の見た目。
 *
 * 過去の記録から読み込む・ルーティンから読み込む（components/exercises/selectable-exercise-row.tsx）と、
 * ルーティンを更新の差分確認（components/routines/routine-diff-exercise-row.tsx）で共通。
 * 前者は行全体がチェックのタップ領域、後者は行全体がアコーディオンの開閉でチェックボックスだけが
 * チェックのタップ領域、とタップの割り当てが違うため、**このコンポーネントはタップを持たない**。
 */
export function ExerciseRowFrame({
  checkbox,
  name,
  category,
  source,
  slug,
  body,
  trailing,
  content,
  horizontalPadding = 0,
  hideBorder = false,
  gap = 10,
  infoGap = 3,
  alignItems = 'center',
}: Props) {
  const images = getExerciseImages({ source, slug });

  const inner = (
    <>
      <ExerciseThumbnail source={images.thumbnail} size={40} />
      <View style={[styles.info, { gap: infoGap }]}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <CategoryChip category={category} />
          {/* trailingを右端に寄せるのは、marginLeft:'auto'ではなく伸びる余白で行う。
              auto marginは行が1ptでも溢れた瞬間に縮小の配分を壊し、種目名が
              「ペ…」のように1文字まで潰れる（390pt端末で発生。393ptでは出ない） */}
          {trailing != null && <View style={styles.spacer} />}
          {trailing}
        </View>
        {body}
      </View>
    </>
  );

  return (
    <View
      style={[styles.row, { paddingHorizontal: horizontalPadding, gap, alignItems }, hideBorder && styles.rowBorderless]}
    >
      {checkbox}
      {content ? (
        <TouchableOpacity
          style={[styles.content, { gap, alignItems }]}
          onPress={content.onPress}
          accessibilityRole="button"
          accessibilityState={content.accessibilityState}
          accessibilityLabel={content.accessibilityLabel}
        >
          {inner}
        </TouchableOpacity>
      ) : (
        inner
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowBorderless: { borderBottomWidth: 0 },
  content: { flex: 1, flexDirection: 'row' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // flexBasis 0なので、溢れたときの縮小はすべて種目名側が引き受ける（余白は0まで潰れるだけ）
  spacer: { flex: 1 },
  name: { ...Typography.cardTitle, color: Colors.textPrimary, flexShrink: 1 },
});
