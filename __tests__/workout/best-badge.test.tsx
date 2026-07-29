import { act, create } from 'react-test-renderer';
import { BestBadge } from '@/components/workout/best-badge';

describe('BestBadge', () => {
  it('「ベスト」というラベルを表示する（「自己ベスト」だと2行折返しになるため短縮）', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<BestBadge />);
    });
    expect(root.root.findByProps({ children: 'ベスト' })).toBeDefined();
  });

  it('labelを渡すとその文言になる（内訳カードは独立した行に置けるので「自己ベスト」と書ける）', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<BestBadge label="自己ベスト" />);
    });
    expect(root.root.findByProps({ children: '自己ベスト' })).toBeDefined();
  });
});
