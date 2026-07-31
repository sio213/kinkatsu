import { act, create } from 'react-test-renderer';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ExerciseThumbnail } from '@/components/exercises/exercise-thumbnail';
import { Colors } from '@/constants/theme';

function render(props: Partial<Parameters<typeof ExerciseThumbnail>[0]> = {}) {
  const merged = { source: 1, size: 46, ...props };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<ExerciseThumbnail {...merged} />);
  });
  return root;
}

describe('ExerciseThumbnail', () => {
  it('sourceがあれば画像を表示し、プレースホルダーは出さない', () => {
    const root = render({ source: 1 });
    expect(root.root.findAllByType(Image)).toHaveLength(1);
    expect(root.root.findAllByType(Image)[0].props.source).toBe(1);
    expect(root.root.findAllByType(Path)).toHaveLength(0);
  });

  // 素材を持たないカスタム種目。以前は他種目（ベンチプレス）のサムネイルを流用しており、
  // 自作の種目に無関係な写真が出ていた
  it('sourceがなければ画像を描かず、プレースホルダーの線画を出す', () => {
    const root = render({ source: undefined });
    expect(root.root.findAllByType(Image)).toHaveLength(0);
    expect(root.root.findAllByType(Path)).toHaveLength(1);
  });

  it('プレースホルダーの線画はtextPlaceholder色のstrokeで描く（塗りではない）', () => {
    const root = render({ source: undefined });
    const path = root.root.findAllByType(Path)[0];
    expect(path.props.stroke).toBe(Colors.textPlaceholder);
    expect(path.props.fill).toBe('none');
  });

  // 枠に対する比率で出すと端数で0.5pxになり線がぼけるため、どの枠サイズでも同じ値にする
  it.each([38, 40, 46])('%dpxの枠でもアイコンサイズは20pxで固定', (size) => {
    const root = render({ source: undefined, size });
    const svg = root.root.findAllByType(Svg)[0];
    expect(svg.props.width).toBe(20);
    expect(svg.props.height).toBe(20);
  });

  // プレースホルダーの行だけ枠の形が変わると一覧がガタつくため、外形は写真ありと同一にする
  it('枠の外形（サイズ・角丸・枠線）は画像ありと同じで、増えるのは中央寄せだけ', () => {
    const frameStyle = (root: ReturnType<typeof create>) =>
      StyleSheet.flatten(root.root.findAllByType(View)[0].props.style);
    const withImage = frameStyle(render({ source: 1, size: 46 }));
    const { alignItems, justifyContent, ...withoutImage } = frameStyle(
      render({ source: undefined, size: 46 }),
    );

    expect(withoutImage).toEqual(withImage);
    expect(alignItems).toBe('center');
    expect(justifyContent).toBe('center');
    // 比較対象が空同士で通ってしまわないよう、外形の中身も直接押さえておく
    expect(withImage).toMatchObject({ width: 46, height: 46, borderRadius: 7, borderWidth: 1 });
  });

  it('bordered=falseでも画像・プレースホルダーの出し分けは変わらない', () => {
    const root = render({ source: undefined, bordered: false });
    expect(root.root.findAllByType(Path)).toHaveLength(1);
  });
});
