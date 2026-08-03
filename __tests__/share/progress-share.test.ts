import {
  buildShareText,
  shareProgressCard,
  SHARE_HASHTAGS,
  type ProgressShareSummary,
} from '@/lib/share/progress-share';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';

function summary(overrides: Partial<ProgressShareSummary> = {}): ProgressShareSummary {
  return {
    exerciseName: 'ベンチプレス',
    metricLabel: null,
    value: '100',
    unit: 'kg',
    ...overrides,
  };
}

describe('buildShareText', () => {
  it('最大○○（指標名なし）では種目名と値だけを並べる', () => {
    expect(buildShareText(summary())).toBe(`ベンチプレス 100kg\n${SHARE_HASHTAGS.join(' ')}`);
  });

  it('集計系の指標では指標名を挟む', () => {
    expect(buildShareText(summary({ metricLabel: '総重量', value: '2400' }))).toBe(
      `ベンチプレス 総重量 2400kg\n${SHARE_HASHTAGS.join(' ')}`,
    );
  });

  // 描く点が無い期間でも共有カード自体は出せる（グラフは枠だけになる）。
  // 値が無いまま「ベンチプレス nullkg」と書き出さないことを保証する
  it('値が無いときは数値を書かない', () => {
    expect(buildShareText(summary({ value: null, metricLabel: '総重量' }))).toBe(
      `ベンチプレスの記録\n${SHARE_HASHTAGS.join(' ')}`,
    );
  });

  it('ハッシュタグは必ず末尾の行に入る', () => {
    const lines = buildShareText(summary()).split('\n');
    expect(lines[lines.length - 1]).toBe(SHARE_HASHTAGS.join(' '));
  });
});

describe('shareProgressCard', () => {
  const ref = { current: {} as never };
  let share: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // RN標準のShareを使う（react-native-shareはNew Architectureで起動時に落ちるため使えない）
    share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  });

  afterEach(() => {
    share.mockRestore();
  });

  it('カードを画像に焼いて、本文付きで共有シートを開く', async () => {
    const result = await shareProgressCard(ref, summary());

    expect(captureRef).toHaveBeenCalledWith(ref, expect.objectContaining({ format: 'png' }));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ message: buildShareText(summary()) }),
    );
    expect(result).toBe('shared');
  });

  // 受け側アプリ（特にX）が本文を拾わないことがあるため、手で貼れる逃げ道を必ず残す
  it('ハッシュタグをクリップボードにもコピーする', async () => {
    await shareProgressCard(ref, summary());
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(buildShareText(summary()));
  });

  it('画像のパスをfile://付きで渡す', async () => {
    await shareProgressCard(ref, summary());
    expect(share.mock.calls[0][0].url).toBe('file:///tmp/share-card.png');
  });

  it('共有シートを閉じただけならdismissedを返す', async () => {
    share.mockResolvedValueOnce({ action: Share.dismissedAction });
    await expect(shareProgressCard(ref, summary())).resolves.toBe('dismissed');
  });

  it('カードが描画されていなければ例外を投げる', async () => {
    await expect(shareProgressCard({ current: null }, summary())).rejects.toThrow();
    expect(captureRef).not.toHaveBeenCalled();
  });
});
