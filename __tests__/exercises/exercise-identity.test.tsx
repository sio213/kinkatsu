import { act, create } from 'react-test-renderer';
import { Image } from 'expo-image';
import { Text } from 'react-native';
import { ExerciseIdentity } from '@/components/exercises/exercise-identity';

const images = { thumbnail: 1 };

function render(props: Partial<Parameters<typeof ExerciseIdentity>[0]> = {}) {
  const merged = { images, name: 'ベンチプレス', category: 'chest', ...props };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<ExerciseIdentity {...merged} />);
  });
  return root;
}

describe('ExerciseIdentity', () => {
  it('サムネイル・種目名・カテゴリラベルを表示する', () => {
    const root = render();
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('ベンチプレス');
    expect(texts).toContain('胸');
    expect(root.root.findAllByType(Image)[0].props.source).toBe(images.thumbnail);
  });

  it('nameTrailingを種目名の隣に描画する', () => {
    const root = render({ nameTrailing: <Text>バッジ</Text> });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('バッジ');
  });

  it('metaTrailingをカテゴリチップの隣に描画する', () => {
    const root = render({ metaTrailing: <Text>3セット</Text> });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('3セット');
  });

  it('nameTrailing/metaTrailingを渡さなければ何も描画しない（それぞれ2要素のまま）', () => {
    const root = render();
    // 名前1つ + カテゴリラベル1つ の2件のみ
    expect(root.root.findAllByType(Text)).toHaveLength(2);
  });

  it('nameTrailing/metaTrailingにfalseを渡した場合も何も描画しない（呼び出し元の条件付きレンダリングと同じパターン）', () => {
    // session-exercise-card.tsx等はmetaTrailing={!expanded && <Text>...}のように
    // 条件がfalseのときは明示的にfalseを渡してくる。undefinedと同じく無視されることを確認する
    const root = render({ nameTrailing: false, metaTrailing: false });
    expect(root.root.findAllByType(Text)).toHaveLength(2);
  });

  it('nameTrailingとmetaTrailingを同時に渡すと両方描画される', () => {
    const root = render({ nameTrailing: <Text>バッジ</Text>, metaTrailing: <Text>3セット</Text> });
    const texts = root.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toEqual(expect.arrayContaining(['ベンチプレス', '胸', 'バッジ', '3セット']));
  });
});
