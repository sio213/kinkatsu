import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { openSettings } from '@/lib/notifications/permissions';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  state: 'denied' | 'undetermined';
  onRequest: () => void;
};

// デザイン案(デザイン検討/ルーティン デザイン案.html「通知OFF時／端末通知が拒否の警告＋動線」)
// に準拠。warningアイコン+タイトル+本文+アクションボタンの構成
export function PermissionBanner({ state, onRequest }: Props) {
  const denied = state === 'denied';

  return (
    <View style={styles.banner}>
      <IconSymbol name="exclamationmark.triangle.fill" size={20} color={Colors.warningAccent} style={styles.icon} />
      <View style={styles.body}>
        <Text style={styles.title}>{denied ? '端末の通知がオフです' : '通知の許可が必要です'}</Text>
        {denied && <Text style={styles.desc}>このままでは通知が届きません</Text>}
        <TouchableOpacity
          style={styles.btn}
          onPress={denied ? openSettings : onRequest}
          accessibilityRole="button"
          accessibilityLabel={denied ? '設定を開く' : '許可する'}
        >
          {denied && <IconSymbol name="arrow.up.right.square" size={16} color={Colors.onAccent} />}
          <Text style={styles.btnText}>{denied ? '設定を開く' : '許可する'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.warningSurface,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: 10,
    padding: 12,
  },
  icon: { flexShrink: 0 },
  body: { flex: 1, gap: 6 },
  title: { ...Typography.caption, fontWeight: '700', color: Colors.warningText },
  desc: { ...Typography.caption, color: Colors.warningText, lineHeight: 16 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: Colors.warning,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  btnText: { ...Typography.caption, fontWeight: '700', color: Colors.onAccent },
});
