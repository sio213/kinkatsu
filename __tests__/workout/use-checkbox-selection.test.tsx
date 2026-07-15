import { useCheckboxSelection } from '@/hooks/use-checkbox-selection';
import React from 'react';
import { act, create } from 'react-test-renderer';

function Harness({
  ids,
  onChange,
}: {
  ids: number[];
  onChange: (value: ReturnType<typeof useCheckboxSelection>) => void;
}) {
  const result = useCheckboxSelection(ids);
  onChange(result);
  return null;
}

function render(ids: number[]) {
  const results: ReturnType<typeof useCheckboxSelection>[] = [];
  act(() => {
    create(<Harness ids={ids} onChange={(r) => results.push(r)} />);
  });
  return {
    latest: () => results[results.length - 1],
  };
}

test('初期状態は未選択(allSelectedはfalse、selectedIdsは空)', () => {
  const { latest } = render([1, 2, 3]);
  expect(latest().selectedIds.size).toBe(0);
  expect(latest().allSelected).toBe(false);
});

test('idsが空配列ならallSelectedはfalseのまま(0/0で誤ってtrueにならない)', () => {
  const { latest } = render([]);
  expect(latest().allSelected).toBe(false);
});

test('toggleで選択・解除できる', () => {
  const results: ReturnType<typeof useCheckboxSelection>[] = [];
  act(() => {
    create(<Harness ids={[1, 2]} onChange={(r) => results.push(r)} />);
  });
  act(() => {
    results[results.length - 1].toggle(1);
  });
  expect(Array.from(results[results.length - 1].selectedIds)).toEqual([1]);

  act(() => {
    results[results.length - 1].toggle(1);
  });
  expect(results[results.length - 1].selectedIds.size).toBe(0);
});

test('全件選択済みでtoggleAllを押すと全解除になる', () => {
  const results: ReturnType<typeof useCheckboxSelection>[] = [];
  act(() => {
    create(<Harness ids={[1, 2]} onChange={(r) => results.push(r)} />);
  });
  act(() => {
    results[results.length - 1].selectAll([1, 2]);
  });
  expect(results[results.length - 1].allSelected).toBe(true);

  act(() => {
    results[results.length - 1].toggleAll();
  });
  expect(results[results.length - 1].selectedIds.size).toBe(0);
});

test('未選択・一部選択の状態でtoggleAllを押すと全選択になる', () => {
  const results: ReturnType<typeof useCheckboxSelection>[] = [];
  act(() => {
    create(<Harness ids={[1, 2, 3]} onChange={(r) => results.push(r)} />);
  });
  act(() => {
    results[results.length - 1].toggle(1);
  });
  act(() => {
    results[results.length - 1].toggleAll();
  });
  expect(Array.from(results[results.length - 1].selectedIds).sort()).toEqual([1, 2, 3]);
  expect(results[results.length - 1].allSelected).toBe(true);
});

test('selectAllで指定したid集合に一括で置き換わる(取得成功時の初期全選択用途)', () => {
  const results: ReturnType<typeof useCheckboxSelection>[] = [];
  act(() => {
    create(<Harness ids={[1, 2, 3]} onChange={(r) => results.push(r)} />);
  });
  act(() => {
    results[results.length - 1].selectAll([2, 3]);
  });
  expect(Array.from(results[results.length - 1].selectedIds).sort()).toEqual([2, 3]);
});
