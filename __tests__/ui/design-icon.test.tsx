import { act, create } from 'react-test-renderer';
import Svg, { G, Path } from 'react-native-svg';
import { DesignIcon } from '@/components/ui/design-icon';

function render(props: Parameters<typeof DesignIcon>[0]) {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<DesignIcon {...props} />);
  });
  return root;
}

describe('DesignIcon', () => {
  // 線画アイコン(dumbbell-outline)を足すために描画を分岐させたので、既存のMaterial Symbols
  // （すべて塗り）が従来どおり描かれることを直接押さえておく
  describe('塗りのアイコン（既存のMaterial Symbols）', () => {
    it('fillに色を渡し、strokeは使わない', () => {
      const root = render({ name: 'edit', color: '#2563EB' });
      const path = root.root.findAllByType(Path)[0];
      expect(path.props.fill).toBe('#2563EB');
      expect(path.props.stroke).toBeUndefined();
      expect(path.props.strokeWidth).toBeUndefined();
    });

    it('viewBoxはMaterial Symbolsの 0 -960 960 960 のまま', () => {
      const root = render({ name: 'edit', color: '#000000' });
      expect(root.root.findAllByType(Svg)[0].props.viewBox).toBe('0 -960 960 960');
    });

    // Svg自身が内部でGを使うため、DesignIconが足したGはrotationの有無で見分ける
    const rotationGroups = (root: ReturnType<typeof create>) =>
      root.root.findAllByType(G).filter((g) => g.props.rotation != null);

    it('rotateを持つアイコンはGで包んで回転させる（chevron-rightはexpand-moreの回転で作っている）', () => {
      const root = render({ name: 'chevron-right', color: '#000000' });
      const [g] = rotationGroups(root);
      expect(g.props.rotation).toBe(-90);
      expect(g.findAllByType(Path)).toHaveLength(1);
    });

    it('rotateを持たないアイコンは回転させない', () => {
      const root = render({ name: 'edit', color: '#000000' });
      expect(rotationGroups(root)).toHaveLength(0);
    });
  });

  describe('線画のアイコン（dumbbell-outline）', () => {
    it('塗らずにstrokeで描く', () => {
      const root = render({ name: 'dumbbell-outline', color: '#94A3B8' });
      const path = root.root.findAllByType(Path)[0];
      expect(path.props.fill).toBe('none');
      expect(path.props.stroke).toBe('#94A3B8');
      expect(path.props.strokeWidth).toBe(1.7);
      expect(path.props.strokeLinecap).toBe('round');
    });

    it('viewBoxは24pxグリッド（Material Symbolsとは別系統の素材のため）', () => {
      const root = render({ name: 'dumbbell-outline', color: '#94A3B8' });
      expect(root.root.findAllByType(Svg)[0].props.viewBox).toBe('0 0 24 24');
    });

    it('sizeはSvgの幅・高さに渡り、線幅はviewBox基準のまま（表示サイズに比例して太くなる）', () => {
      const root = render({ name: 'dumbbell-outline', color: '#94A3B8', size: 54 });
      const svg = root.root.findAllByType(Svg)[0];
      expect(svg.props.width).toBe(54);
      expect(svg.props.height).toBe(54);
      expect(root.root.findAllByType(Path)[0].props.strokeWidth).toBe(1.7);
    });
  });
});
