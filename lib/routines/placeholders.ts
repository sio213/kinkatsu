import { Alert } from 'react-native';

// テンプレートセット編集画面（後続タスクで実装予定）への導線だけを先に用意しておくための
// 共通プレースホルダー。実装後はこの呼び出し箇所をrouter.push等に差し替える
export function showRoutineFeatureComingSoon() {
  Alert.alert('準備中', 'この機能は近日公開予定です。');
}
