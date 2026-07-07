import AsyncStorage from '@react-native-async-storage/async-storage';
import { useExerciseSortStore } from '@/lib/exercises/sort-store';

const STORAGE_KEY = 'exercise-sort-preference';

beforeEach(async () => {
  useExerciseSortStore.setState({ listSortBy: 'category', pickerSortBy: 'recent' });
  await AsyncStorage.clear();
});

test('初期値はcategory', () => {
  expect(useExerciseSortStore.getState().listSortBy).toBe('category');
});

test('setListSortByで値が更新される', () => {
  useExerciseSortStore.getState().setListSortBy('frequent');
  expect(useExerciseSortStore.getState().listSortBy).toBe('frequent');
});

test('setListSortByした値はAsyncStorageに永続化される', async () => {
  useExerciseSortStore.getState().setListSortBy('name');
  // persistの書き込みは非同期のため次のマイクロタスクまで待つ
  await new Promise((resolve) => setTimeout(resolve, 0));

  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  expect(JSON.parse(raw!).state.listSortBy).toBe('name');
});

test('merge: 永続化データが有効な値ならそれを採用する', async () => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: { listSortBy: 'recent' }, version: 0 }),
  );
  await useExerciseSortStore.persist.rehydrate();
  expect(useExerciseSortStore.getState().listSortBy).toBe('recent');
});

test('merge: persistedが存在しない（初回起動）場合はデフォルトのまま', async () => {
  await expect(useExerciseSortStore.persist.rehydrate()).resolves.not.toThrow();
  expect(useExerciseSortStore.getState().listSortBy).toBe('category');
});

test.each([
  ['選択肢に無い文字列', 'deprecated-oldest'],
  ['数値', 123],
  ['null', null],
  ['undefined', undefined],
  ['オブジェクト', {}],
  ['空文字', ''],
])('merge: 不正な値(%s)はcategoryにフォールバックする', async (_label, badValue) => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: { listSortBy: badValue }, version: 0 }),
  );
  await useExerciseSortStore.persist.rehydrate();
  expect(useExerciseSortStore.getState().listSortBy).toBe('category');
});

test('merge: 永続化データがstateを含まない壊れた形でもクラッシュしない', async () => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
  await expect(useExerciseSortStore.persist.rehydrate()).resolves.not.toThrow();
  expect(useExerciseSortStore.getState().listSortBy).toBe('category');
});

test('pickerSortByの初期値はrecent（種目タブのlistSortByとは独立）', () => {
  expect(useExerciseSortStore.getState().pickerSortBy).toBe('recent');
});

test('setPickerSortByはlistSortByに影響しない', () => {
  useExerciseSortStore.getState().setPickerSortBy('frequent');
  expect(useExerciseSortStore.getState().pickerSortBy).toBe('frequent');
  expect(useExerciseSortStore.getState().listSortBy).toBe('category');
});

test('setListSortByはpickerSortByに影響しない', () => {
  useExerciseSortStore.getState().setListSortBy('name');
  expect(useExerciseSortStore.getState().listSortBy).toBe('name');
  expect(useExerciseSortStore.getState().pickerSortBy).toBe('recent');
});

test('setPickerSortByした値はAsyncStorageに永続化される', async () => {
  useExerciseSortStore.getState().setPickerSortBy('frequent');
  await new Promise((resolve) => setTimeout(resolve, 0));

  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  expect(JSON.parse(raw!).state.pickerSortBy).toBe('frequent');
});

test('merge: 永続化データにpickerSortByの有効な値があればそれを採用する', async () => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: { pickerSortBy: 'frequent' }, version: 0 }),
  );
  await useExerciseSortStore.persist.rehydrate();
  expect(useExerciseSortStore.getState().pickerSortBy).toBe('frequent');
});

test('merge: persistedが存在しない（初回起動）場合はpickerSortByもデフォルト(recent)のまま', async () => {
  await expect(useExerciseSortStore.persist.rehydrate()).resolves.not.toThrow();
  expect(useExerciseSortStore.getState().pickerSortBy).toBe('recent');
});

test.each([
  ['選択肢に無い文字列', 'deprecated-oldest'],
  ['数値', 123],
  ['null', null],
  ['undefined', undefined],
  ['オブジェクト', {}],
  ['空文字', ''],
])('merge: pickerSortByの不正な値(%s)はrecentにフォールバックする', async (_label, badValue) => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: { listSortBy: 'name', pickerSortBy: badValue }, version: 0 }),
  );
  await useExerciseSortStore.persist.rehydrate();
  expect(useExerciseSortStore.getState().listSortBy).toBe('name');
  expect(useExerciseSortStore.getState().pickerSortBy).toBe('recent');
});

test('merge: listSortByが不正・pickerSortByが有効という組み合わせでもそれぞれ独立して処理される', async () => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: { listSortBy: 'deprecated-oldest', pickerSortBy: 'name' }, version: 0 }),
  );
  await useExerciseSortStore.persist.rehydrate();
  expect(useExerciseSortStore.getState().listSortBy).toBe('category');
  expect(useExerciseSortStore.getState().pickerSortBy).toBe('name');
});
