import { ReminderForm, type ReminderFormHandle } from '@/components/reminders/reminder-form';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { DEFAULT_REMINDER_BODY, DEFAULT_REMINDER_TITLE } from '@/lib/notifications/messages';
import type { ReminderInput } from '@/lib/notifications/types';
import { useRoutineDraftStore } from '@/lib/routines/draft-store';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// タイトル/本文欄を持たない未設定時の初期値。実際に保存されるtitle/bodyは、ルーティン保存時に
// withRoutineReminderContentでルーティン名から作り直されるため、ここでの値は使われない
const DEFAULT_INPUT: ReminderInput = {
  title: DEFAULT_REMINDER_TITLE,
  body: DEFAULT_REMINDER_BODY,
  kind: 'interval',
  hour: 18,
  minute: 0,
  intervalDays: 1,
  enabled: true,
};

// ルーティンフォームの「リマインダー」設定行から遷移する画面(デザイン案の画面⑤)。既存の
// ReminderFormをタイトル・本文欄を隠した状態で流用する。設定内容はドラフトストアにのみ反映し、
// 実際のcreateReminder/updateReminderはルーティン本体の保存(app/routine/new.tsx・edit/[id].tsx)と
// あわせて行う。デザイン案どおりキャンセルボタンは持たず、下部固定の「保存」ボタンのみ
// (戻る操作はヘッダーの標準の戻るボタン/スワイプに任せる)。他のルーティン下位画面
// (exercise-edit等)と同じくScrollView+固定フッターの型に揃えるため、ReminderForm内蔵の
// ボタンは隠しこの画面側でフッターを組む
export default function RoutineReminderScreen() {
  const router = useRouter();
  const reminder = useRoutineDraftStore((state) => state.reminder);
  const setReminder = useRoutineDraftStore((state) => state.setReminder);
  const keyboardInset = useKeyboardInset();
  const formRef = useRef<ReminderFormHandle>(null);
  const [submitDisabled, setSubmitDisabled] = useState(false);

  const handleSubmit = useCallback(
    (input: ReminderInput) => {
      setReminder(input);
      router.back();
    },
    [setReminder, router],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInset={{ bottom: keyboardInset }}
        scrollIndicatorInsets={{ bottom: keyboardInset }}
        keyboardShouldPersistTaps="handled"
      >
        <ReminderForm
          ref={formRef}
          initial={reminder ?? DEFAULT_INPUT}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onSubmitDisabledChange={setSubmitDisabled}
          submitLabel="保存"
          showTitleBody={false}
          hideButtons
        />
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label="保存" onPress={() => formRef.current?.submit()} disabled={submitDisabled} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
