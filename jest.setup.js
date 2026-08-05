/* global jest */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// SNS共有が使うネイティブモジュール。テスト環境には実体が無いので、
// 「何を渡して呼んだか」だけ検証できる形にモックする
// （共有シート自体はRN標準のShareなのでここではモックしない。テスト側でspyOnする）
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => '/tmp/share-card.png'),
}));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
}));
