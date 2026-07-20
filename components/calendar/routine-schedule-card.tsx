import { CategoryChip } from '@/components/exercises/category-chip';
import { DesignIcon } from '@/components/ui/design-icon';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { summarizeCategories } from '@/lib/routines/format';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  routineName: string;
  categories: string[];
  exerciseCount: number;
  // 「毎週 日曜 07:00」（lib/notifications/format.tsのformatKindSummary）または
  // 今日自身の予定なら「今日 07:00」。呼び出し側(app/(tabs)/calendar.tsx)が組み立てて渡す
  timeLabel: string;
  onPress: () => void;
  // 今日自身の予定カードにのみ渡す（デザイン案「未来日は開始ボタンなし・＞のみ」）
  onPressStart?: () => void;
  // 手動で追加した単発予定（PR10）を表す場合true。timeLabelがリマインダーの頻度表示
  // （例:「毎週月曜 07:00」）ではなく素の時刻のみになり、見た目だけでは繰り返し予定と
  // 区別しづらいため、視覚(バッジ)・読み上げ(accessibilityLabel)の両方で明示する（@designer指摘）
  oneTime?: boolean;
  // 手動予定（PR10-3）・リマインダー予定（PR10-6a、2026-07-19に「今回だけスキップ」から
  // 「削除」へ変更）どちらの削除にも共通で使う。渡された場合のみ⋮メニュー（「削除」1項目、
  // components/routines/routine-card-menu.tsxと同じDropdownMenuの使い方）を表示する。
  // 呼び出し側(app/(tabs)/calendar.tsx)は削除前に確認ダイアログを出す責務を持つ（このカードは
  // 確認済みの削除実行のみを担当する）
  onDelete?: () => void;
  // リマインダー予定（PR10-6b）のときだけ呼び出し側が渡す。onDeleteと同じメニュー内に
  // 「今回だけ差し替え」項目を追加で表示する（削除・差し替えは性質が異なる別項目として
  // 区切り線で分けて並列提示する、@designer方針）
  onReplace?: () => void;
};

// routine-card-menu.tsx/exercise-card-menu.tsxと同じ「const items配列を作ってgroupsに渡す」書き方に揃える
function deleteMenuItems(onDelete: () => void): DropdownMenuItem[] {
  return [{ key: 'delete', label: '削除', icon: 'delete-outline', danger: true, onPress: onDelete }];
}

// 削除（取り消し不可）と差し替え（2画面遷移を伴いデータを追加する操作）は性質が異なるため、
// 同じ1グループにまとめず別グループにしてDropdownMenu標準の区切り線で分ける
function replaceMenuItems(onReplace: () => void): DropdownMenuItem[] {
  return [{ key: 'replace', label: '今回だけ差し替え', icon: 'swap-horiz', onPress: onReplace }];
}

// 選択日パネルの予定カード（デザイン案「未来01/未来03/今日01」）。ルーティン紐付き
// リマインダーから算出した「予定」、または手動追加した予定（PR10-3、削除操作を持つ）を表す。
// 実績を表すCalendarExerciseCardとは別コンポーネント（種目単位のセット概要・自己ベスト・前回比較を
// 前提にしたCalendarExerciseCardをそのまま流用すると、予定には無いデータの空欄が不自然に
// 出てしまうため）。タップでルーティン編集画面へ遷移する（このアプリにはルーティンの中身を
// 見るだけの読み取り専用画面が無く、一覧・リマインダーのルーティンバッジタップも同じ
// /routine/edit/[id]に飛ぶ既存パターンに合わせる、2026-07-19確定）。
// ⋮メニュー配置・chevron無しの構成はcomponents/routines/routine-card.tsxの一覧カードに合わせた
// （top行にname+menuSlot(marginLeft:'auto'で右寄せ)、カード全体がタップ領域なのでchevronは不要、
// ユーザー指示で統一）
export const RoutineScheduleCard = memo(function RoutineScheduleCard({
  routineName,
  categories,
  exerciseCount,
  timeLabel,
  onPress,
  onPressStart,
  oneTime = false,
  onDelete,
  onReplace,
}: Props) {
  // onDelete(手動予定・リマインダー予定共通)・onReplace(リマインダー予定のみ)は同じメニュー内に
  // 区切り線で分けた別グループとして並べて出す(@designer方針)。onReplaceは手動予定には渡らない。
  // 破壊的操作の「削除」はroutine-card-menu.tsx/exercise-card-menu.tsxと同じく必ず最後尾に置く
  // （@designer指摘: 削除が最上段だと、メニューを開いた直後に指が最も近い位置に取り消し不可の
  // 操作が来てしまい誤タップのリスクが上がる）
  const menuGroups = onDelete
    ? [...(onReplace ? [replaceMenuItems(onReplace)] : []), deleteMenuItems(onDelete)]
    : null;
  // routine-card.tsxの一覧カードと同じ情報構成（名前・カテゴリ・種目数・スケジュール）で
  // 読み上げ単位をまとめる。カレンダー/一覧のどちらでルーティンを見てもVoiceOver体験が
  // 揃うようにする（@designer指摘）
  const label = [
    routineName,
    categories.length > 0 ? categories.map(getCategoryLabel).join('・') : null,
    `${exerciseCount}種目`,
    timeLabel,
    oneTime ? '1回のみ' : null,
  ]
    .filter(Boolean)
    .join('、');
  const { visible, overflowCount } = summarizeCategories(categories);
  const inner = (
    <>
      <View style={styles.top}>
        <Text style={styles.name} numberOfLines={1}>
          {routineName}
        </Text>
        {menuGroups && (
          <View style={styles.menuSlot}>
            <DropdownMenu
              groups={menuGroups}
              // routine-card-menu.tsx/exercise-card-menu.tsxは項目5つのため160、
              // こちらは「削除」単独、または「削除」/「今回だけ差し替え」の最大2項目
              // までのため少し狭い140で十分（各ラベルの文字数は既存の5項目パターンと大差ない）
              minWidth={140}
              renderTrigger={({ open, onPress: onOpenMenu }) => (
                <TouchableOpacity
                  onPress={onOpenMenu}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  accessibilityRole="button"
                  // routineNameだけだと、同じルーティンを同日に複数回スケジュールした場合
                  // ラベルが重複し区別できないため、timeLabelも含めて一意にする（PRレビュー指摘対応）
                  accessibilityLabel={`「${routineName}」${timeLabel}のメニューを開く`}
                  accessibilityState={{ expanded: open }}
                >
                  <IconSymbol name="ellipsis" size={20} color={open ? Colors.accent : Colors.textPlaceholder} />
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>
      <View style={styles.chipsRow}>
        {visible.map((category) => (
          <CategoryChip key={category} category={category} />
        ))}
        {overflowCount > 0 && <Text style={styles.overflow}>{`+${overflowCount}`}</Text>}
        <Text style={styles.countText}>{`${exerciseCount}種目`}</Text>
      </View>
      <View style={styles.timeBadge}>
        <DesignIcon name="calendar-today" size={15} color={Colors.accent} />
        <Text style={styles.timeText}>{timeLabel}</Text>
        {oneTime && <Text style={styles.oneTimeText}>1回のみ</Text>}
      </View>
    </>
  );

  if (onPressStart) {
    // 今日自身の予定: カード行＋開始ボタンを1つの枠で囲む（デザイン案「今日01」）
    return (
      <View style={styles.wrapperWithButton}>
        <TouchableOpacity
          style={styles.content}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="タップして編集画面を開きます"
        >
          {inner}
        </TouchableOpacity>
        <PrimaryButton
          label="開始"
          icon={<IconSymbol name="play.fill" size={16} color={Colors.onAccent} />}
          onPress={onPressStart}
          accessibilityLabel={`「${routineName}」のトレーニングを開始`}
        />
      </View>
    );
  }

  // 他日の予定: カード全体がそのままタップ領域（デザイン案「未来01/未来03」、開始ボタン無し）
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="タップして編集画面を開きます"
    >
      {inner}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: 10,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 13,
  },
  wrapperWithButton: {
    gap: 10,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 13,
  },
  content: { gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...Typography.bodyStrong, color: Colors.textPrimary, flexShrink: 1 },
  menuSlot: { marginLeft: 'auto' },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  overflow: { ...Typography.caption, fontWeight: '700', color: Colors.textPlaceholder },
  countText: { ...Typography.caption, color: Colors.textMuted, fontWeight: '600' },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  timeText: { ...Typography.footnote, color: Colors.textBody, fontWeight: '600' },
  // textMuted(slate500)だとsurfaceSubtle背景とのコントラスト比がWCAG AA(4.5:1)をわずかに
  // 下回るため、一段濃いtextSecondary(slate600)にする（デザイン指摘対応）
  oneTimeText: { ...Typography.badge, color: Colors.textSecondary },
});
