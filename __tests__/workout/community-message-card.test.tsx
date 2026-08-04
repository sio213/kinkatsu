import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { Pressable, Text, TouchableOpacity } from 'react-native';
import { CommunityMessageCard } from '@/components/workout/community-message-card';
import { PLACEHOLDER_COMMUNITY_MESSAGE } from '@/lib/workout/community-message';

function render(message = PLACEHOLDER_COMMUNITY_MESSAGE) {
  let instance!: ReturnType<typeof create>;
  act(() => {
    instance = create(React.createElement(CommunityMessageCard, { message }));
  });
  return instance.root;
}

// いいね数はnumberのまま渡しているため、文字列だけに絞らず数値も拾う
function texts(root: ReactTestInstance): string[] {
  return root
    .findAllByType(Text)
    .map((t) =>
      [t.props.children]
        .flat()
        .filter((c) => typeof c === 'string' || typeof c === 'number')
        .join(''),
    )
    .filter((s) => s.length > 0);
}

test('本文・投稿者名・いいね数を表示する', () => {
  const root = render({ body: 'よく頑張った', author: 'テスト太郎', likeCount: 12 });

  expect(texts(root)).toEqual(expect.arrayContaining(['よく頑張った', 'テスト太郎', '12']));
});

// ラベル・数値・アイコンが個別に読まれても意味を成さないため、カードで1つにまとめる
test('カード全体が1つの読み上げにまとまる', () => {
  const root = render({ body: 'よく頑張った', author: 'テスト太郎', likeCount: 12 });

  const card = root.findAllByProps({ accessible: true })[0];
  expect(card.props.accessibilityLabel).toBe(
    'テスト太郎からの応援メッセージ。よく頑張った。いいね12件',
  );
});

// ♡・再抽選・⋮ はまだ何もしない。押せないものを押せるように見せない
test('反応アイコンはタップ対象にしない（別Phaseで実装するまで）', () => {
  const root = render();

  expect(root.findAllByType(TouchableOpacity)).toHaveLength(0);
  expect(root.findAllByType(Pressable)).toHaveLength(0);
});
