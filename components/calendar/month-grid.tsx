import { Colors, Typography } from '@/constants/theme';
import { WEEKDAY_LABELS } from '@/lib/format';
import { getCalendarCategoryColor } from '@/lib/calendar/category-color';
import { buildMonthGridDates, isSameDay, toDateKey } from '@/lib/calendar/date-grid';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  year: number;
  month: number; // 0-11
  // 「今日」の判定基準。呼び出し元(app/(tabs)/calendar.tsx)で1回だけ生成した値を渡してもらい、
  // このコンポーネント自身では新規生成しない（today算出元を画面全体で1箇所に集約するため）
  today: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  // 日付キー(YYYY-MM-DD)→代表カテゴリ(10種のslug)。実績がある日だけキーを持つ
  primaryCategoryByDay: Map<string, string>;
  // 日付キー→その日実施した全カテゴリの集合。カテゴリフィルター中の判定にのみ使う
  categorySetByDay: Map<string, Set<string>>;
  // カテゴリフィルターチップで選択中のカテゴリ。CATEGORY_ALL（絞り込みなし）ならnull
  activeFilter: string | null;
};

// 曜日ラベル行の日曜(index 0)・土曜(index 6)だけ色を付ける。日付の数字自体は
// どの状態（今日・選択中・実施日など）でも曜日色を混ぜず、実施状況の色分けだけに専念させる
// （デザイン案通り、曜日色は見出し行のみの装飾）
function weekdayLabelStyle(index: number) {
  if (index === 0) return styles.sundayLabel;
  if (index === 6) return styles.saturdayLabel;
  return null;
}

export const MonthGrid = memo(function MonthGrid({
  year,
  month,
  today,
  selectedDate,
  onSelectDate,
  primaryCategoryByDay,
  categorySetByDay,
  activeFilter,
}: Props) {
  const dates = useMemo(() => buildMonthGridDates(year, month), [year, month]);

  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={label} style={[styles.weekdayLabel, weekdayLabelStyle(i)]}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {dates.map((date) => {
          const inCurrentMonth = date.getMonth() === month;
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);

          // 前月/翌月の日付は選択対象外（タップしても月を跨いだ選択は今回スコープ外）にし、
          // 表示のみ薄いグレーにする。VoiceOverでも読み上げ対象から外し、当月の日付と
          // 数字が重複して読まれる（月の境界が分からなくなる）のを防ぐ
          if (!inCurrentMonth) {
            return (
              <View key={date.getTime()} style={styles.cellTouchable} importantForAccessibility="no-hide-descendants">
                <View style={styles.cell}>
                  <Text style={[styles.cellText, styles.cellTextMuted]}>{date.getDate()}</Text>
                </View>
              </View>
            );
          }

          const dateKey = toDateKey(date);
          const category = primaryCategoryByDay.get(dateKey);
          const hasRecord = category != null;
          // 実績が無い日はアクセント色、ある日はその代表カテゴリの色を「今日/選択中」の
          // 枠線・下線・強調文字色として使う（塗りつぶしが無いときの既定色がアクセント）
          const accentOrCategoryColor = hasRecord ? getCalendarCategoryColor(category) : Colors.accent;
          // 塗りつぶしは「実施日 かつ 選択中でない」場合のみ（選択中は枠線表現に切り替わる）
          const showFill = hasRecord && !isSelected;
          // フィルター中、該当カテゴリを実施していない日は目立たなくする（完全に消すと
          // 「その日は何もしていない」ように見え情報が失われるため、実施の有無自体は残す）
          const isFilteredOut = activeFilter != null && !(categorySetByDay.get(dateKey)?.has(activeFilter) ?? false);
          // 塗りつぶし(showFill)がある日は、コンテナ全体にopacityを掛けると白背景と白文字
          // (cellTextOnFill)が両方とも白ページへ向かってブレンドされ文字がほぼ消えてしまう
          // （フィルターが最も伝えたい「別カテゴリの実施日」情報が最も読めなくなる本末転倒な状態）。
          // そのためshowFill中はopacityではなく、背景をカテゴリ色の薄いトーン（アルファ付き16進）
          // に、文字をカテゴリ色そのもの（白ではなく）に切り替える、accent/dangerSurface等
          // 既存の「薄い背景+濃い文字」パターンと同じ考え方で対応する。
          // 塗りつぶしが無い日（記録なし、または選択中で枠線表現）はopacityで十分読める
          // （選択中は枠線・今日の判定自体を隠したくないためopacity対象から外す）
          const dimWithOpacity = isFilteredOut && !showFill && !isSelected;
          const filteredFillColor = `${accentOrCategoryColor}33`; // 約20%アルファの薄いトーン

          return (
            <TouchableOpacity
              key={date.getTime()}
              style={[styles.cellTouchable, dimWithOpacity && styles.cellFilteredOut]}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`${date.getMonth() + 1}月${date.getDate()}日${isToday ? '、今日' : ''}${hasRecord ? `、実施日、${getCategoryLabel(category)}` : ''}${isFilteredOut ? '、絞り込み対象外' : ''}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelectDate(date)}
            >
              <View
                style={[
                  styles.cell,
                  isSelected && { borderColor: accentOrCategoryColor },
                  showFill && { backgroundColor: isFilteredOut ? filteredFillColor : accentOrCategoryColor },
                ]}
              >
                {/* digitWrapperは幅を明示せず数字テキストの実寸に自然にフィットさせる
                    （親cellのalignItems:'center'により伸長されない）。下線バーは
                    alignSelf:'stretch'でdigitWrapperと同じ幅になり、結果として
                    「桁数に応じて数字とぴったり同じ幅の下線」をtext-decoration無しで再現する */}
                <View style={styles.cellDigitWrapper}>
                  <Text
                    style={[
                      styles.cellText,
                      showFill
                        ? isFilteredOut
                          ? [styles.cellTextEmphasis, { color: accentOrCategoryColor }]
                          : styles.cellTextOnFill
                        : (isToday || isSelected) && [styles.cellTextEmphasis, { color: accentOrCategoryColor }],
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {isToday && (
                    <View
                      style={[
                        styles.cellTodayUnderlineBar,
                        { backgroundColor: showFill && !isFilteredOut ? Colors.onAccent : accentOrCategoryColor },
                      ]}
                    />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

const CELL_WIDTH_PERCENT = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: {
    ...Typography.caption,
    fontWeight: '700',
    width: CELL_WIDTH_PERCENT,
    textAlign: 'center',
    color: Colors.textPlaceholder,
    paddingVertical: 4,
  },
  sundayLabel: { color: Colors.danger },
  saturdayLabel: { color: Colors.accent },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellTouchable: { width: CELL_WIDTH_PERCENT, aspectRatio: 1, padding: 1 },
  // 塗りつぶしが無い日（実施記録なし、または選択中で枠線表現）にのみ使う簡易的な非強調表現。
  // switch.tsxのdisabled(opacity:0.5)よりやや強めに落としているが、月グリッド上で
  // 「対象外」であることを一目で伝えたいための意図的な差分（塗りつぶしがある日はopacityで
  // なく色そのものを変えて対応するため、この値は「無塗りの日」専用）
  cellFilteredOut: { opacity: 0.35 },
  cell: {
    flex: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellDigitWrapper: { alignItems: 'center' },
  cellText: { ...Typography.metric, color: Colors.textBody },
  cellTextMuted: { color: Colors.textPlaceholder },
  // 枠線・下線で強調する状態（今日 or 選択中）の文字色・太さ。色自体はデザイン案の
  // カテゴリ色/アクセント色を都度styleに渡すため、ここにはcolorを含めない
  cellTextEmphasis: { fontWeight: '800' },
  // 塗りつぶし（実施日かつ非選択）の上に乗る文字。背景が濃い色なので常に白固定
  cellTextOnFill: { color: Colors.onAccent, fontWeight: '700' },
  // デザイン案は下線をセルの枠(border-bottom)ではなく日付の数字自体の
  // text-decorationとして描画しており、text-underline-offsetで数字との間に
  // 隙間を空けている。RNのTextはtextDecorationLineにoffsetを指定できないため、
  // 数字の下に間隔を空けた専用バーを敷いて同じ見た目を再現する
  cellTodayUnderlineBar: { alignSelf: 'stretch', height: 2, marginTop: 3, borderRadius: 1 },
});
