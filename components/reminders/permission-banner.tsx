import { Colors } from '@/constants/theme';
import { openSettings } from '@/lib/notifications/permissions';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  state: 'denied' | 'undetermined';
  onRequest: () => void;
};

export function PermissionBanner({ state, onRequest }: Props) {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {state === 'denied'
          ? '通知がOFFになっています。設定から有効にしてください。'
          : '通知の許可が必要です。'}
      </Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={state === 'denied' ? openSettings : onRequest}
      >
        <Text style={styles.btnText}>
          {state === 'denied' ? '設定を開く' : '許可する'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.warningSurface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  text: { color: Colors.warningText, fontSize: 13 },
  btn: {
    backgroundColor: Colors.warning,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  btnText: { color: Colors.onAccent, fontSize: 13, fontWeight: '600' },
});
