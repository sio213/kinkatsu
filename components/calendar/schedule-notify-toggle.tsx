import { PermissionBanner } from '@/components/reminders/permission-banner';
import { Switch } from '@/components/ui/switch';
import { Colors, Typography } from '@/constants/theme';
import type { PermissionState } from '@/lib/notifications/permissions';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  permState: PermissionState | null;
  onRequestPermission: () => void;
};

// 予定(scheduledWorkouts)の通知ON/OFF専用（2026-07-22）。routines/routine-reminder-field.tsxの
// トグル行を参考にしているが、あちらの「ON/OFF×設定済み/未設定」4パターンはリマインダーの
// 繰り返し設定（別画面で頻度を決める）があって初めて生じる分岐で、この予定は「作成時に選んだ
// 1回の時刻に通知するかどうか」だけのため、そのうちトグル行+権限バナーの2パターンだけに絞った
// 薄い実装にする（@designerレビュー指摘: 4パターン全部を持ち込むと過剰）。見出しはFormLabel/
// SectionHeadingと同じアクセントバー+Typography.sectionHeadingトークンを直接使い、隣接する
// FormField「時刻」と同じ見た目の階層に揃える（@designerレビュー指摘: bodyStrongの独自ラベルだと
// 「時刻」と見た目が変わってしまう）。SectionHeadingコンポーネント自体は使わない
// ——あちらはaccessible=trueで見出し+trailingを1つの非対話ノードに畳み込む設計のため、
// 対話可能なSwitchをtrailingに入れるとVoiceOver/TalkBackでスイッチ単体にフォーカスできなくなる
// （見出しとコントロールをFormLabel+contentと同じ「兄弟要素」として置くことでこれを避ける）
export function ScheduleNotifyToggle({ enabled, onToggleEnabled, permState, onRequestPermission }: Props) {
  const permissionDenied = enabled && permState != null && permState !== 'granted';

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.bar} />
        <Text style={styles.label}>通知</Text>
        <Switch value={enabled} onValueChange={onToggleEnabled} accessibilityLabel="通知する" />
      </View>
      {permissionDenied && (
        <PermissionBanner state={permState as 'denied' | 'undetermined'} onRequest={onRequestPermission} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.accent },
  label: { ...Typography.sectionHeading, color: Colors.textBody, flex: 1 },
});
