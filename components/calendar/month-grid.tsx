import { Colors, Typography } from '@/constants/theme';
import { getCalendarCategoryColor } from '@/lib/calendar/category-color';
import { buildMonthGridDates, isSameDay, toDateKey } from '@/lib/calendar/date-grid';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

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
  // 日付キー→予定の代表カテゴリ（ルーティン紐付きリマインダー由来）。実績がある日でも
  // 参照する（表示上は実績優先だが、フィルターでは予定側も独立して該当判定する）
  primaryCategoryByScheduleDay: Map<string, string>;
  // 日付キー→その日に予定がある全カテゴリの集合。カテゴリフィルター中の判定にのみ使う
  categorySetByScheduleDay: Map<string, Set<string>>;
  // カテゴリフィルターチップで選択中のカテゴリ。CATEGORY_ALL（絞り込みなし）ならnull
  activeFilter: string | null;
};

export const MonthGrid = memo(function MonthGrid({
  year,
  month,
  today,
  selectedDate,
  onSelectDate,
  primaryCategoryByDay,
  categorySetByDay,
  primaryCategoryByScheduleDay,
  categorySetByScheduleDay,
  activeFilter,
}: Props) {
  const dates = useMemo(() => buildMonthGridDates(year, month), [year, month]);

  return (
    <View style={styles.grid}>
      {/* keyはdate.getTime()(月ごとに毎回変わる絶対時刻)ではなくグリッド内位置(i)を使う。
          セルの「アイデンティティ」は日付の値ではなく「グリッドの何行目何列目か」という
          位置そのもの(値だけ差し替わる固定スロット)であり、date.getTime()をkeyにすると
          月を跨ぐたびに全セル(最大42個)のkeyが一致しなくなり、Reactが毎回全セルを
          アンマウント→再マウントしていた。実機では、これが月送りのレイアウト再計算と重なり、
          日別パネルが一瞬消えるちらつきの原因になっていた(実機の画面録画で確認済み)。
          週数が同じ月同士(例: 8月→9月は両方5週)の遷移では、位置keyにすることでReactが
          既存コンポーネントのprops更新として扱えるようになり、無駄な破棄・再構築が無くなる */}
      {dates.map((date, i) => {
        const inCurrentMonth = date.getMonth() === month;
        const isToday = isSameDay(date, today);
        const isSelected = isSameDay(date, selectedDate);

        // 前月/翌月の日付は選択対象外（タップしても月を跨いだ選択は今回スコープ外）にし、
        // 表示のみ薄いグレーにする。VoiceOverでも読み上げ対象から外し、当月の日付と
        // 数字が重複して読まれる（月の境界が分からなくなる）のを防ぐ
        if (!inCurrentMonth) {
          return (
            <View key={i} style={styles.cellTouchable} importantForAccessibility="no-hide-descendants">
              <View style={styles.cell}>
                <Text style={[styles.cellText, styles.cellTextMuted]}>{date.getDate()}</Text>
              </View>
            </View>
          );
        }

        const dateKey = toDateKey(date);
        const category = primaryCategoryByDay.get(dateKey);
        const hasRecord = category != null;
        // 予定（ルーティン紐付きリマインダー由来）は実績の有無に関わらず取得する。以前は
        // 実績がある日は予定を握りつぶしていたが、「実績はフィルター非該当でも、同じ日の
        // 予定が別カテゴリでフィルター該当なら見つけられるようにしたい」という要望があり、
        // 独立して扱うようにした（実績優先の表示自体は下のshowFill/showDotで維持する）
        const scheduleCategory = primaryCategoryByScheduleDay.get(dateKey);
        const hasSchedule = scheduleCategory != null;
        // フィルター中、該当カテゴリを実施/予定していない日は「非該当」扱い（デザイン案
        // 「確定：カテゴリフィルタ適用」の凡例通り、過去/未来問わずグレーの点のみで
        // 塗りつぶさない。完全に消すと「その日は何もしていない」ように見えるため、
        // 実施/予定の有無自体はグレードットで残す）
        const isFilteredOut = activeFilter != null && !(categorySetByDay.get(dateKey)?.has(activeFilter) ?? false);
        const isScheduleFilteredOut =
          activeFilter != null && !(categorySetByScheduleDay.get(dateKey)?.has(activeFilter) ?? false);
        // 「実績/予定がフィルターに該当している」を肯定形でひとまとめにしておく。
        // showFill・ドットの色・accessibilityLabelの3箇所で同じ「該当」判定を使い回すため、
        // !isFilteredOutのような二重否定がその都度発生するのを避ける
        const recordMatches = hasRecord && !isFilteredOut;
        const scheduleMatches = hasSchedule && !isScheduleFilteredOut;
        // 実績が無い日はアクセント色、実績がある日はその代表カテゴリ、予定のみある日は
        // 予定の代表カテゴリの色を「今日/選択中」の枠線・下線・強調文字色として使う
        // （塗りつぶしが無いときの既定色がアクセント。実績は塗りつぶし、予定は輪郭のみで
        // 区別する仕様のため、選択中の枠線色はどちらでも同じ仕組みを使い分けなく共有できる）。
        // フィルターで対象外の実績/予定は、他の非強調日と同じくColors.textBody（黒）に
        // 落とす。ただし選択中(isSelected)は対象外にせず常にカテゴリ色を出す。選択は
        // ユーザーが明示的にその日をタップした結果であり、フィルターの当落に関わらず
        // 「実際は何のカテゴリか」を見せる情報の方を優先するため。実績も予定も無い今日も、
        // フィルター中は「該当なし」の他の日と同じ扱いにしたいので、その場合はアクセント色
        // ではなくColors.textBody（黒）にする（フィルター無し、または選択中は従来通り青）。
        // 実績はあるがフィルター非該当（recordMatchesがfalse）でも、同じ日の予定が該当していれば
        // （scheduleMatches）、黒には落とさない。ただし色は予定のカテゴリ色ではなく、あくまで
        // その日のメインカテゴリ＝実績側の色のまま（例: 今日「肩5セットの実績」＋「腕1セットの
        // 予定」で腕フィルター中は、ヒットしているのは腕の予定だが、その日のメインカテゴリは
        // 肩なので数字・下線バーは肩の色になる。ヒットした側の色に飛び火させない）
        const accentOrCategoryColor = hasRecord
          ? isSelected || recordMatches || scheduleMatches
            ? getCalendarCategoryColor(category)
            : Colors.textBody
          : hasSchedule
            ? isSelected || scheduleMatches
              ? getCalendarCategoryColor(scheduleCategory)
              : Colors.textBody
            : activeFilter != null && !isSelected
              ? Colors.textBody
              : Colors.accent;
        // 塗りつぶしは「実施日 かつ 選択中でない かつ フィルター対象内（非該当でない）」場合のみ。
        // 選択中は枠線表現に切り替わり、フィルターで非該当の日は塗りつぶさずドットに切り替わる
        const showFill = recordMatches && !isSelected;
        // ドットが必要なのは「実績で塗りつぶされていない日」＝実績が無い、または実績があっても
        // フィルターで非該当になった日。実績がフィルター該当で塗りつぶされている日は、別カテゴリの
        // 予定があってもドットは追加しない（要望の範囲外まで情報を足さないため。実績＝塗りつぶしが
        // 最優先という既存の階層をそのまま維持する）
        const showDot = !isSelected && !showFill && (hasRecord || hasSchedule);
        // ドットの色もaccentOrCategoryColorと同じ考え方に揃える。「その日のメインカテゴリ
        // （実績があれば実績側、無ければ予定側）」の色を、実績・予定のどちらかがフィルターに
        // 該当していれば出す。ヒットしたのが予定側でも、色は予定側のカテゴリ色には飛び火させず
        // メインカテゴリの色のまま（showDotに来る時点でrecordMatchesは常にfalseだが、
        // 将来の変更で前提が崩れても壊れないよう明示的にrecordMatches||scheduleMatchesで書く）
        const dotCategory = hasRecord ? category : scheduleCategory;
        const isDotColored = recordMatches || scheduleMatches;

        return (
          // 押下中のopacityフィードバック(activeOpacity相当)はあえて付けない。react-native-gesture-handler
          // のPressableに替えても、月スワイプのPanジェスチャーへ乗っ取られた後も「押されている(薄い)」
          // 状態がタッチが離れるまでこのセルに残り続けることが実機の画面録画で確認された（スワイプの
          // タッチ開始点がちょうど日付セルの上になるため、ほぼ毎回どこかのセルがこの状態になる）。
          // ドラッグ中ずっとそのセルだけ色が薄いままになり、指を離した瞬間に元の色へ戻るのが
          // 「日付の数値がちらつく」の主要因だった。フィードバックを完全に無くすことで、
          // ジェスチャー間の調停タイミングに依存せず確実に解消する（選択状態は枠線で示されるため
          // 押下フィードバックが無くても操作感は損なわれない）
          <Pressable
            key={i}
            style={styles.cellTouchable}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`${date.getMonth() + 1}月${date.getDate()}日${isToday ? '、今日' : ''}${hasRecord ? `、実施日、${getCategoryLabel(category)}` : ''}${hasSchedule ? `、予定あり、${getCategoryLabel(scheduleCategory)}` : ''}${
              // 「絞り込み対象外」は実績・予定のどちらもフィルターに該当しないときだけ読み上げる。
              // 実績は非該当でも予定が該当していれば(またはその逆)、その日はフィルター上「見つかる」
              // 対象なので対象外とは言えない
              (hasRecord || hasSchedule) && !recordMatches && !scheduleMatches ? '、絞り込み対象外' : ''
            }`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelectDate(date)}
          >
            <View
              style={[
                styles.cell,
                isSelected && { borderColor: accentOrCategoryColor },
                showFill && { backgroundColor: accentOrCategoryColor },
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
                      ? styles.cellTextOnFill
                      : (isToday || isSelected) && [styles.cellTextEmphasis, { color: accentOrCategoryColor }],
                  ]}
                >
                  {date.getDate()}
                </Text>
                {isToday && (
                  <View
                    style={[
                      styles.cellTodayUnderlineBar,
                      { backgroundColor: showFill ? Colors.onAccent : accentOrCategoryColor },
                    ]}
                  />
                )}
              </View>
              {/* ドットはcellDigitWrapperの外（cell自体）に置き、bottomで絶対配置する。
                  親cellのalignItems:'center'はabsolute配置の子にも効くため、
                  left/transformを指定しなくても水平中央に来る（RN/Yogaの挙動）。
                  色はdotCategory（メインカテゴリ）を使い、実績・予定のどちらかがフィルターに
                  該当していれば出す。どちらも非該当ならグレー。dotCategoryは
                  hasRecord||hasSchedule（showDotの条件）が真である限り必ずどちらか一方が
                  定義されるが、TSはrecordMatches||scheduleMatchesのOR越しにそこまで
                  絞り込めないため、ここでは非nullアサーションを使う */}
              {showDot && (
                <View
                  style={[styles.filterDot, isDotColored && { backgroundColor: getCalendarCategoryColor(dotCategory!) }]}
                />
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
});

const CELL_WIDTH_PERCENT = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellTouchable: { width: CELL_WIDTH_PERCENT, aspectRatio: 1, padding: 1 },
  cell: {
    flex: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // デザイン案「確定：カテゴリフィルタ適用」の非該当日マーカー（グレードット、5x5円）
  filterDot: {
    position: 'absolute',
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.borderStrong,
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
  // 数字の下に間隔を空けた専用バーを敷いて同じ見た目を再現する。position:absoluteに
  // しているのは、通常のレイアウト（marginTop）だとバーの分だけcellDigitWrapperの
  // 高さが伸び、それを内包するcellの中央揃え計算に含まれてしまい、今日の数字だけ
  // 他の日付より数pt上にずれて見えてしまうため。絶対配置にしてwrapperの高さ計算から
  // 除外することで、数字の縦位置を他の日付と揃える。
  // bottom:-3(数字との間隔1 + バー高さ2)は、フィルター対象外の予定/実績で今日にも
  // グレードットが出るケース（絞り込み時）でバーとドットが近接して見えるのを避けるため、
  // 元の間隔3から1まで詰めてドット側との余白を広げたもの
  cellTodayUnderlineBar: { position: 'absolute', left: 0, right: 0, bottom: -3, height: 2, borderRadius: 1 },
});
