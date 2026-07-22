import { CalendarExerciseCard } from '@/components/calendar/calendar-exercise-card';
import { SessionTimeGroupHeader } from '@/components/calendar/session-time-group-header';
import { RoutineAddExerciseButton } from '@/components/routines/routine-add-exercise-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors, Typography } from '@/constants/theme';
import type { ScheduledExerciseCardSet } from '@/hooks/use-scheduled-exercise-cards';
import { formatHourMinute, getTimeOfDay, getTimeOfDayLabel } from '@/lib/calendar/time-of-day';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// 一度も実施していない種目は、summarizeExerciseSetsの「0セット」（実在のセッションで
// 記録し忘れた場合と同じ文言）を出すと「記録し忘れ」と誤読される（@designer指摘）ため、
// このコンポーネント専用の文言に差し替える
const NO_HISTORY_LABEL = '実施記録なし';

export type ScheduleExerciseCardGroupCard = {
  // scheduledWorkoutExerciseId（実体化済み）/routineExerciseId（未実体化プレビュー）と
  // 呼び出し元ごとに識別子の種類が異なるため、Reactのkeyとして使う値を呼び出し元
  // （scheduled-workout-exercise-group.tsx/reminder-schedule-exercise-group.tsx）に
  // 文字列化させてここに集約する
  key: string;
  exerciseId: number;
  name: string;
  category: string;
  source: string;
  slug: string | null;
  measurementType: string;
  sets: ScheduledExerciseCardSet[];
};

type Props = {
  // ルーティン紐付き予定（自動・手動どちらも）のときだけ呼び出し元が渡す。SessionTimeGroupHeaderの
  // 右端に表示する（2026-07-21、2026-07-22にデザイン案「複数18」準拠で左端→右端へ変更）。
  // 直接予定（個別種目選択）ではルーティン名に相当するものが無いため渡さない
  routineName?: string;
  // SessionTimeGroupHeaderにそのまま渡す時刻表示用の合成タイムスタンプ（選択日+予定のhour/minute）。
  // 今日パネルは実績セッションと同じ時系列に混ぜるためentry.sortAtをそのまま流用できる
  sessionStartedAt: number;
  title: string;
  cards: ScheduleExerciseCardGroupCard[] | 'error' | null;
  // 'error'状態を持たない呼び出し元（reminder-schedule-exercise-group.tsxのuseRoutinePreviewExerciseCards）
  // はretryを持たないため、cards==='error'になり得る場合だけ呼び出し元が渡す
  onRetryCards?: () => void;
  // 今日自身の予定にのみ渡す（デザイン案「未来日は開始ボタンなし」、routine-schedule-card.tsxと同じ）
  onPressStart?: () => void;
  // 種目カードは1件ごとの詳細ではなく、この予定の種目一覧をまとめて編集する画面へ遷移する
  // （過去の記録の種目カードが記録編集画面(/workout/[sessionId])へ飛ぶのと同じ考え方、
  // @ユーザー指摘2026-07-20）。どの種目カードをタップしても遷移先は同じなので引数を取らない
  onPress: () => void;
};

// 予定（直接予定・ルーティン予定どちらも）の選択日パネル表示の見た目のみを担う共通コンポーネント
// （2026-07-21、旧DirectScheduleExerciseGroupから分割）。データ取得（scheduledWorkoutIdからの
// useScheduledExerciseCards、routineIdからのuseRoutinePreviewExerciseCards）は呼び出し元の
// 薄いコンテナ（scheduled-workout-exercise-group.tsx/reminder-schedule-exercise-group.tsx）が
// 担い、このコンポーネントはpropsで受け取ったcardsを並べるだけ。要約カード1枚
// (旧RoutineScheduleCard)と違い、予定の中身（種目）を確認する手段が無いという@designer指摘を
// 受け、過去の記録と同じ種目一覧カード(CalendarExerciseCard)をそのまま並べる（サムネ・カテゴリ・
// 目標セット内容が見える）。まだ実施していない予定のため、前回比較(comparison)は今回の実施が
// 無いと成立しない概念のため常にnullで渡す。自己ベストバッジも同様の理由（まだ実施していないのに
// 「ベスト」と出ると実績と誤認する、@designer指摘）で常にfalse固定にする。2026-07-22に
// 背景・枠線で囲む「グルーピング」表示をやめ、過去の記録の種目一覧（DayCardList）と同じ
// フラット表示に統一した（@ユーザー指摘）。⋮メニュー（削除・今回だけ差し替え）は全種別で
// 撤去した（2026-07-22、@ユーザー指摘）。削除はカードタップ先の目標セット編集画面
// (schedule-workout-edit.tsx)の⋮「削除」に一本化し、「今回だけ差し替え」機能自体を廃止した
// （schedule-time-picker.tsx/schedule-routine-picker.tsxのisReplaceMode関連コードも撤去済み）
export const ScheduleExerciseCardGroup = memo(function ScheduleExerciseCardGroup({
  routineName,
  sessionStartedAt,
  title,
  cards,
  onRetryCards,
  onPressStart,
  onPress,
}: Props) {
  // titleだけだと、同じルーティン/種目構成を同日に複数回スケジュールした場合ラベルが重複し
  // 区別できない（routine-schedule-card.tsxの既存パターンと同じ理由、@reviewer指摘:
  // 共通化した際にこの対策が引き継がれていなかった）ため、SessionTimeGroupHeaderと同じ
  // 時刻ラベルをaccessibilityLabelにも含めて一意にする
  const timePeriod = getTimeOfDay(new Date(sessionStartedAt));
  const timeLabel = `${getTimeOfDayLabel(timePeriod)} ${formatHourMinute(new Date(sessionStartedAt))}`;

  return (
    <View style={styles.wrapper}>
      <SessionTimeGroupHeader sessionStartedAt={sessionStartedAt} isSchedule routineName={routineName} />
      {cards != null && cards !== 'error' && cards.length > 0 && (
        <View style={styles.cardList}>
          {cards.map((card) => (
            <CalendarExerciseCard
              key={card.key}
              exerciseId={card.exerciseId}
              name={card.name}
              category={card.category}
              source={card.source}
              slug={card.slug}
              measurementType={card.measurementType}
              sets={card.sets}
              isBest={false}
              comparison={null}
              onPress={onPress}
              accessibilityHint="タップして予定の種目をまとめて編集します"
              emptySetsLabel={NO_HISTORY_LABEL}
            />
          ))}
        </View>
      )}
      {/* ルーティン削除等で種目が0件になった予定（極めて稀なレース条件、
          lib/calendar/scheduled-workouts.tsのaddScheduledWorkoutの0件フォールバック参照）は、
          見出しだけが残り種目カードが1枚も無い「何もタップできない」状態になっていた
          （ユーザー報告のバグ）。見出しの下に必ずタップ可能な行を出し、編集画面へ誘導する。
          ルーティン編集フォーム等の種目0件時と同じ破線ボックスのデザイン（デザイン案
          「未来（予定）／種目0件」）をRoutineAddExerciseButtonのcompact variantで共有する
          （2026-07-22、@ユーザー指摘で独自スタイルの空状態から統一） */}
      {cards != null && cards !== 'error' && cards.length === 0 && (
        <RoutineAddExerciseButton
          variant="compact"
          onPress={onPress}
          accessibilityLabel={`「${title}」${timeLabel}に種目を追加`}
          accessibilityHint="タップして予定の種目を追加します"
        />
      )}
      {cards === 'error' && onRetryCards && (
        // useCalendarDayExercises(過去日パネル)のエラー表示・再試行ボタンと同じ体験に揃える
        <View style={styles.errorRow}>
          <IconSymbol name="exclamationmark.triangle.fill" size={18} color={Colors.danger} />
          <Text style={styles.errorText}>種目を読み込めませんでした</Text>
          <TouchableOpacity
            onPress={onRetryCards}
            accessibilityRole="button"
            accessibilityLabel="再試行"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.retryText}>再試行</Text>
          </TouchableOpacity>
        </View>
      )}
      {onPressStart && (
        <PrimaryButton
          label="開始"
          icon={<IconSymbol name="play.fill" size={16} color={Colors.onAccent} />}
          onPress={onPressStart}
          accessibilityLabel={`「${title}」${timeLabel}のトレーニングを開始`}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // 過去の記録の種目一覧（app/(tabs)/calendar.tsxのdayGroup）と同じgapのみのフラット表示
  // （2026-07-22、@ユーザー指摘: 背景・枠線での「グルーピング」を廃止）
  wrapper: { gap: 8 },
  cardList: { gap: 8 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  errorText: { ...Typography.body, color: Colors.danger },
  retryText: { ...Typography.bodyStrong, color: Colors.accent },
});
