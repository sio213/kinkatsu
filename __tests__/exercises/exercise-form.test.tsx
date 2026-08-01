const mockScrollToFirstError = jest.fn();

jest.mock('@/components/ui/form-scroll-context', () => ({
  useScrollToFirstError: () => mockScrollToFirstError,
  // FormFieldが内部で呼ぶ。このテストでは自動スクロールの位置登録自体は検証対象外のためno-opでよい
  useFormScrollRegistration: () => {},
}));

import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import { Switch } from '@/components/ui/switch';
import { ExerciseForm, type ExerciseFormHandle } from '@/components/exercises/exercise-form';

function getInputs(root: ReactTestInstance) {
  return root.findAllByType(TextInput);
}

function findButtonByLabel(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((btn: ReactTestInstance) =>
      btn.findAllByType(Text).some((t: ReactTestInstance) => t.props.children === label),
    );
}

function allTexts(root: ReactTestInstance) {
  return root
    .findAllByType(Text)
    .map((t: ReactTestInstance) => t.props.children)
    .flat();
}

// 「記録する項目」の選択行。accessibilityLabelは「選択肢名。入力欄 — 代表種目」の形
function findMeasurementRow(root: ReactTestInstance, label: string) {
  return root
    .findAllByType(TouchableOpacity)
    .find((row: ReactTestInstance) => String(row.props.accessibilityLabel ?? '').startsWith(`${label}。`));
}

async function renderForm(props: Partial<React.ComponentProps<typeof ExerciseForm>> = {}) {
  const onSubmit = jest.fn();
  const ref = React.createRef<ExerciseFormHandle>();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ExerciseForm, { ref, onSubmit, ...props }));
  });
  return { root: instance.root, onSubmit, ref };
}

test('未入力で送信するとバリデーションエラーが表示され onSubmit は呼ばれない', async () => {
  const { root, onSubmit, ref } = await renderForm();

  await act(async () => {
    ref.current!.submit();
  });

  const texts = allTexts(root);
  expect(texts).toContain('種目名を入力してください');
  expect(texts).toContain('カテゴリを選択してください');
  expect(onSubmit).not.toHaveBeenCalled();
});

test('未入力で送信するとscrollToFirstErrorがエラーのフィールド名付きで呼ばれる(自動スクロール機能の配線確認)', async () => {
  mockScrollToFirstError.mockClear();
  const { ref } = await renderForm();

  await act(async () => {
    ref.current!.submit();
  });

  // react-hook-formのonInvalidは(errors, event)の2引数で呼ばれるため、1つ目の引数だけ見る
  expect(mockScrollToFirstError.mock.calls[0][0]).toEqual(
    expect.objectContaining({ name: expect.anything(), category: expect.anything() }),
  );
});

test('有効な値で送信が成功した場合はscrollToFirstErrorは呼ばれない', async () => {
  mockScrollToFirstError.mockClear();
  const { root, ref } = await renderForm();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('ベンチプレス');
  });
  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(mockScrollToFirstError).not.toHaveBeenCalled();
});

test('name・categoryを入力して送信すると trim・null化された値で onSubmit が呼ばれる', async () => {
  const { root, onSubmit, ref } = await renderForm();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('  ベンチプレス  ');
  });

  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    measurementType: 'weight_reps',
    formPoints: [],
  });
});

test('編集モード: initialの値がフォームに反映される', async () => {
  const { root } = await renderForm({
    initial: { name: '腕立て伏せ', category: 'chest', note: '週2回' },
  });

  const inputs = getInputs(root);
  expect(inputs[0].props.value).toBe('腕立て伏せ');
  expect(inputs[inputs.length - 1].props.value).toBe('週2回');
});

test('initial.categoryがEXERCISE_CATEGORIESに存在しない場合、選び直さないと送信できない', async () => {
  const { root, onSubmit, ref } = await renderForm({
    initial: { name: '旧種目', category: '廃止済みカテゴリ', note: '' },
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit).not.toHaveBeenCalled();
  expect(allTexts(root)).toContain('カテゴリを選択してください');
});

test('送信失敗後に値を修正すると再送信で onSubmit が呼ばれる', async () => {
  const { root, onSubmit, ref } = await renderForm();

  await act(async () => {
    ref.current!.submit();
  });
  expect(onSubmit).not.toHaveBeenCalled();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('デッドリフト');
  });
  const backChip = findButtonByLabel(root, '背中')!;
  await act(async () => {
    backChip.props.onPress();
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'デッドリフト',
    category: 'back',
    note: null,
    favorite: false,
    measurementType: 'weight_reps',
    formPoints: [],
  });
});

test('favoriteスイッチをONにして送信すると favorite: true で onSubmit が呼ばれる', async () => {
  const { root, onSubmit, ref } = await renderForm();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('ベンチプレス');
  });
  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });
  const favoriteSwitch = root.findByType(Switch);
  await act(async () => {
    favoriteSwitch.props.onValueChange(true);
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: true,
    measurementType: 'weight_reps',
    formPoints: [],
  });
});

test('initial.favorite=true のとき Switch の初期値が true になる', async () => {
  const { root } = await renderForm({
    initial: { name: 'ベンチプレス', category: 'chest', favorite: true },
  });

  expect(root.findByType(Switch).props.value).toBe(true);
});

test('ref経由の submit() でもバリデーション・送信が実行される', async () => {
  const ref = React.createRef<ExerciseFormHandle>();
  const onSubmit = jest.fn();
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(ExerciseForm, { ref, onSubmit }));
  });

  const [nameInput] = getInputs(instance.root);
  await act(async () => {
    nameInput.props.onChangeText('スクワット');
  });
  const legChip = findButtonByLabel(instance.root, '脚')!;
  await act(async () => {
    legChip.props.onPress();
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'スクワット',
    category: 'leg',
    note: null,
    favorite: false,
    measurementType: 'weight_reps',
    formPoints: [],
  });
});

test('フォームのポイントを入力して送信すると、空欄を除いたtrim済みの値で onSubmit が呼ばれる', async () => {
  const { root, onSubmit, ref } = await renderForm();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('ベンチプレス');
  });
  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });

  const addPointBtn = findButtonByLabel(root, '＋ ポイントを追加')!;
  await act(async () => {
    addPointBtn.props.onPress();
  });

  const pointInputs = getInputs(root).slice(1, 3);
  await act(async () => {
    pointInputs[0].props.onChangeText('  肩甲骨を寄せる  ');
  });
  await act(async () => {
    pointInputs[1].props.onChangeText('   ');
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    measurementType: 'weight_reps',
    formPoints: ['肩甲骨を寄せる'],
  });
});

test('フォームのポイントの削除ボタンで該当行が取り除かれる', async () => {
  const { root, onSubmit, ref } = await renderForm();

  const [nameInput] = getInputs(root);
  await act(async () => {
    nameInput.props.onChangeText('ベンチプレス');
  });
  const chestChip = findButtonByLabel(root, '胸')!;
  await act(async () => {
    chestChip.props.onPress();
  });

  const addPointBtn = findButtonByLabel(root, '＋ ポイントを追加')!;
  await act(async () => {
    addPointBtn.props.onPress();
  });

  const pointInputs = getInputs(root).slice(1, 3);
  await act(async () => {
    pointInputs[0].props.onChangeText('1つ目');
  });
  await act(async () => {
    pointInputs[1].props.onChangeText('2つ目');
  });

  const removeFirstBtn = root.findByProps({ accessibilityLabel: 'ポイント1を削除' });
  await act(async () => {
    removeFirstBtn.props.onPress();
  });

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    measurementType: 'weight_reps',
    formPoints: ['2つ目'],
  });
});

test('編集モード: initialのformPointsがフォームに反映される', async () => {
  const { root } = await renderForm({
    initial: {
      name: 'ベンチプレス',
      category: 'chest',
      formPoints: ['ポイントA', 'ポイントB'],
    },
  });

  const pointInputs = getInputs(root).slice(1, 3);
  expect(pointInputs[0].props.value).toBe('ポイントA');
  expect(pointInputs[1].props.value).toBe('ポイントB');
});

test('initial.source=presetのとき、フォームのポイント欄は表示されない（詳細画面でguideしか表示しないため編集不可にする）', async () => {
  const { root, onSubmit, ref } = await renderForm({
    initial: {
      name: 'ベンチプレス',
      category: 'chest',
      source: 'preset',
      formPoints: ['既存のポイント'],
    },
  });

  expect(findButtonByLabel(root, '＋ ポイントを追加')).toBeUndefined();
  // name(0), note(1) の2つのみ。ポイント入力欄は存在しない
  expect(getInputs(root)).toHaveLength(2);

  await act(async () => {
    ref.current!.submit();
  });

  // 非表示のままdefaultValuesが維持され、既存のformPointsが壊されず送信される
  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'ベンチプレス',
    category: 'chest',
    note: null,
    favorite: false,
    measurementType: 'weight_reps',
    formPoints: ['既存のポイント'],
  });
});

describe('記録する項目（計測タイプ）', () => {
  test('新規作成時は「重量×回数」が選択済みで、未選択の状態が無い', async () => {
    const { root } = await renderForm();

    expect(findMeasurementRow(root, '重量×回数')!.props.accessibilityState.checked).toBe(true);
    for (const label of ['回数のみ', '時間のみ', '距離×時間', '重量×時間']) {
      expect(findMeasurementRow(root, label)!.props.accessibilityState.checked).toBe(false);
    }
  });

  test('5つの選択肢すべてが最初から表示される（折りたたまない）', async () => {
    const { root } = await renderForm();

    for (const label of ['重量×回数', '回数のみ', '時間のみ', '距離×時間', '重量×時間']) {
      expect(findMeasurementRow(root, label)).toBeDefined();
    }
  });

  test('選んだ計測タイプが onSubmit の値に反映される', async () => {
    const { root, onSubmit, ref } = await renderForm();

    const [nameInput] = getInputs(root);
    await act(async () => {
      nameInput.props.onChangeText('プランク');
    });
    await act(async () => {
      findButtonByLabel(root, '体幹')!.props.onPress();
    });
    await act(async () => {
      findMeasurementRow(root, '時間のみ')!.props.onPress();
    });

    await act(async () => {
      ref.current!.submit();
    });

    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: 'プランク', measurementType: 'time' }),
    );
  });

  test('編集モード: initial.measurementType が選択状態に反映される', async () => {
    const { root } = await renderForm({
      initial: { name: 'ランニング', category: 'cardio', measurementType: 'distance_time' },
    });

    expect(findMeasurementRow(root, '距離×時間')!.props.accessibilityState.checked).toBe(true);
    expect(findMeasurementRow(root, '重量×回数')!.props.accessibilityState.checked).toBe(false);
  });

  test('initial.measurementType が未知の値でも weight_reps に丸められ、保存できなくならない', async () => {
    const { root, onSubmit, ref } = await renderForm({
      initial: { name: '旧種目', category: 'chest', measurementType: 'weight_distance' },
    });

    expect(findMeasurementRow(root, '重量×回数')!.props.accessibilityState.checked).toBe(true);

    await act(async () => {
      ref.current!.submit();
    });

    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ measurementType: 'weight_reps' }),
    );
  });

  test('accessibilityLabelに入力欄・代表種目の説明まで含まれる（VoiceOver用の文言崩れを検知）', async () => {
    const { root } = await renderForm();
    const labels = root
      .findAllByType(TouchableOpacity)
      .map((row: ReactTestInstance) => row.props.accessibilityLabel)
      .filter((label: unknown): label is string => typeof label === 'string');

    expect(labels).toContain('重量×回数。重量(kg)・回数 — ベンチプレス、ダンベルカール');
    expect(labels).toContain('回数のみ。回数 — 懸垂、腕立て伏せ');
    expect(labels).toContain('時間のみ。時間(分:秒) — プランク、デッドハング');
    expect(labels).toContain('距離×時間。距離(km)・時間 — ランニング、バイク');
    expect(labels).toContain('重量×時間。重量(kg)・時間 — 加重プランク、ファーマーズウォーク');
  });

  test('initial.source=presetのとき、記録する項目は表示されない（seedが正のため変更させない）', async () => {
    const { root } = await renderForm({
      initial: { name: 'ベンチプレス', category: 'chest', source: 'preset' },
    });

    expect(findMeasurementRow(root, '重量×回数')).toBeUndefined();
  });
});

describe('記録する項目の変更確認（記録がある種目）', () => {
  // beforeEachでのrestoreだとdescribe内の最後のテストが張ったAlertスパイが解除されず、
  // 後続のテストに漏れる（@reviewer指摘）
  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function renderWithRecords(recordCount: number) {
    return renderForm({
      recordCount,
      initial: { name: '懸垂', category: 'back', measurementType: 'weight_reps' },
    });
  }

  test('記録があり計測タイプを変えて保存すると、確認アラートが1回だけ出る', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { root, ref } = await renderWithRecords(12);

    await act(async () => {
      findMeasurementRow(root, '回数のみ')!.props.onPress();
    });
    await act(async () => {
      ref.current!.submit();
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('記録する項目を変更しますか？');
    expect(alertSpy.mock.calls[0][1]).toBe(
      'この種目にはすでに記録があります。変更すると、これまでの記録がグラフや記録一覧に表示されなくなる場合があります。記録は削除されず、元に戻せば再表示されます。',
    );
  });

  test('「変更する」を押すと新しい計測タイプで onSubmit が呼ばれる', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === '変更する')?.onPress?.();
    });
    const { root, onSubmit, ref } = await renderWithRecords(12);

    await act(async () => {
      findMeasurementRow(root, '回数のみ')!.props.onPress();
    });
    await act(async () => {
      ref.current!.submit();
    });

    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ measurementType: 'reps' }));
  });

  test('「キャンセル」を押すと保存されず、選択も元の値に戻る', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'キャンセル')?.onPress?.();
    });
    const { root, onSubmit, ref } = await renderWithRecords(12);

    await act(async () => {
      findMeasurementRow(root, '回数のみ')!.props.onPress();
    });
    await act(async () => {
      ref.current!.submit();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(findMeasurementRow(root, '重量×回数')!.props.accessibilityState.checked).toBe(true);
    expect(findMeasurementRow(root, '回数のみ')!.props.accessibilityState.checked).toBe(false);
  });

  test('記録が0件なら、計測タイプを変えてもアラートは出ずそのまま保存される', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { root, onSubmit, ref } = await renderWithRecords(0);

    await act(async () => {
      findMeasurementRow(root, '回数のみ')!.props.onPress();
    });
    await act(async () => {
      ref.current!.submit();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ measurementType: 'reps' }));
  });

  test('記録が1件（境界値）でもアラートは出る', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { root, ref } = await renderWithRecords(1);

    await act(async () => {
      findMeasurementRow(root, '回数のみ')!.props.onPress();
    });
    await act(async () => {
      ref.current!.submit();
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    // 件数は本文に出さない（カード単位と日単位で数え方が食い違うため。2026-08-01）
    expect(alertSpy.mock.calls[0][1]).not.toMatch(/\d+件/);
  });

  test('一度別の値にしてから元に戻した場合はアラートが出ず、そのまま保存される', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { root, onSubmit, ref } = await renderWithRecords(12);

    await act(async () => {
      findMeasurementRow(root, '回数のみ')!.props.onPress();
    });
    await act(async () => {
      findMeasurementRow(root, '重量×回数')!.props.onPress();
    });
    await act(async () => {
      ref.current!.submit();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ measurementType: 'weight_reps' }),
    );
  });

  test('キャンセルで戻るのは計測タイプだけで、同時に編集した他の項目は保持される', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'キャンセル')?.onPress?.();
    });
    const { root, ref } = await renderWithRecords(12);

    const [nameInput] = getInputs(root);
    await act(async () => {
      nameInput.props.onChangeText('チンニング');
    });
    await act(async () => {
      findMeasurementRow(root, '回数のみ')!.props.onPress();
    });
    await act(async () => {
      ref.current!.submit();
    });

    expect(getInputs(root)[0].props.value).toBe('チンニング');
    expect(findMeasurementRow(root, '重量×回数')!.props.accessibilityState.checked).toBe(true);
  });

  test('記録があっても計測タイプを変えていなければアラートは出ない', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { root, onSubmit, ref } = await renderWithRecords(12);

    const [nameInput] = getInputs(root);
    await act(async () => {
      nameInput.props.onChangeText('チンニング');
    });
    await act(async () => {
      ref.current!.submit();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: 'チンニング', measurementType: 'weight_reps' }),
    );
  });
});

test('onSubmitDisabledChange が初期はfalse、送信失敗後にtrueで呼ばれる', async () => {
  const onSubmitDisabledChange = jest.fn();
  const { ref } = await renderForm({ onSubmitDisabledChange });

  expect(onSubmitDisabledChange).toHaveBeenCalledWith(false);

  await act(async () => {
    ref.current!.submit();
  });

  expect(onSubmitDisabledChange).toHaveBeenLastCalledWith(true);
});

test('focusName() で種目名欄にフォーカスできる', async () => {
  const { root, ref } = await renderForm();

  const [nameInput] = getInputs(root);
  const focusSpy = jest.spyOn(nameInput.instance, 'focus');

  act(() => {
    ref.current!.focusName();
  });

  expect(focusSpy).toHaveBeenCalledTimes(1);
});
