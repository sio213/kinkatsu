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
  // 手動予定（PR10-3、削除可）のときだけ呼び出し側が渡す。渡された場合のみ⋮メニュー
  // （「削除」1項目、components/routines/routine-card-menu.tsxと同じDropdownMenuの使い方）を表示する。
  // リマインダー予定（削除不可）には渡さないため⋮自体が出ない
  onDelete?: () => void;
  // リマインダー予定（削除不可、PR10-6a）のときだけ呼び出し側が渡す。渡された場合のみ⋮メニュー
  // （「今回だけスキップ」1項目）を表示する。取り消せる操作（選択日パネルの「元に戻す」で戻せる）
  // のためdanger扱いにはしない（@designer方針、「削除」との危険度の違いを色で表す）
  onSkip?: () => void;
  // リマインダー予定（PR10-6b）のときだけ呼び出し側が渡す。onSkipと同じメニュー内に
  // 「今回だけ差し替え」項目を追加で表示する（スキップ・差し替えは別項目として並列提示する、
  // @designer方針）。onSkipと同時に渡ってonSkip単独で表示されるケースと両立する
  onReplace?: () => void;
};

// routine-card-menu.tsx/exercise-card-menu.tsxと同じ「const items配列を作ってgroupsに渡す」書き方に揃える
function deleteMenuItems(onDelete: () => void): DropdownMenuItem[] {
  return [{ key: 'delete', label: '削除', icon: 'delete-outline', danger: true, onPress: onDelete }];
}

// スキップ（その場で完結する取り消し可能な操作）と差し替え（2画面遷移を伴いデータを追加する
// 操作）は性質が異なるため、同じ1グループにまとめず別グループにしてDropdownMenu標準の
// 区切り線で分ける（@designer指摘: ラベルが「今回だけ」まで一致し末尾でしか区別できないため）
function reminderMenuGroups(onSkip?: () => void, onReplace?: () => void): DropdownMenuItem[][] {
  return [
    ...(onSkip ? [[{ key: 'skip', label: '今回だけスキップ', icon: 'event-busy' as const, onPress: onSkip }]] : []),
    ...(onReplace
      ? [[{ key: 'replace', label: '今回だけ差し替え', icon: 'swap-horiz' as const, onPress: onReplace }]]
      : []),
  ];
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
  onSkip,
  onReplace,
}: Props) {
  // onDelete(手動予定)・onSkip/onReplace(リマインダー予定)は出所で分岐する呼び出し側の責務により
  // 排他的に渡される想定(手動予定にはonSkip/onReplaceは渡らない)。onSkip/onReplaceは同じ
  // メニュー内に区切り線で分けた別グループとして並べて出す(@designer方針)
  const menuGroups = onDelete
    ? [deleteMenuItems(onDelete)]
    : onSkip || onReplace
      ? reminderMenuGroups(onSkip, onReplace)
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
              // こちらは「削除」単独、または「今回だけスキップ」/「今回だけ差し替え」の最大2項目
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
