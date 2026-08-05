import * as Clipboard from 'expo-clipboard';
import type { RefObject } from 'react';
import { Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * 共有カードと共有テキストに載せるアプリ名。**仮の値**。
 *
 * アプリ名は未確定（KB-255）・ロゴも未作成（KB-256）なので、いまは文字だけで代用している。
 * 確定したらここだけ直せばカードとテキストの両方に反映される。
 */
export const SHARE_APP_NAME = 'kinkatsu';

/**
 * 共有テキストに添えるハッシュタグ。
 *
 * **これがそのまま投稿に載る保証は無い。** iOSの共有シートで渡したテキストを投稿欄に入れるかは
 * 受け側アプリ（X・Instagram・LINE）の実装次第で、Xは画像とテキストの片方しか拾わないことが
 * 報告されている。そのため「テキストが1文字も渡らなくても成立する」ことを前提に、
 * アプリ名とハッシュタグは共有カードの画像そのものにも焼き込んである
 * （components/exercises/exercise-progress-share-card.tsx）。
 */
export const SHARE_HASHTAGS = ['#kinkatsu', '#筋トレ記録'] as const;

export type ProgressShareSummary = {
  exerciseName: string;
  /** いま見ている指標の名前（「最大重量」「総重量」など）。最大○○のときはnullで省く */
  metricLabel: string | null;
  /** 代表値。整形済みの文字列（例: '100'）。点が1つも無ければnullで、数値ごと省く */
  value: string | null;
  /** 値の単位（'kg'・'回'など） */
  unit: string;
};

/** 共有シートに渡す本文。1行目に実績、2行目にハッシュタグを置く */
export function buildShareText(summary: ProgressShareSummary): string {
  const { exerciseName, metricLabel, value, unit } = summary;
  const headline =
    value == null
      ? `${exerciseName}の記録`
      : metricLabel == null
        ? `${exerciseName} ${value}${unit}`
        : `${exerciseName} ${metricLabel} ${value}${unit}`;
  return `${headline}\n${SHARE_HASHTAGS.join(' ')}`;
}

export type ShareResult = 'shared' | 'dismissed';

/**
 * 共有カードのViewを画像に焼いて、OS標準の共有シートを開く。
 *
 * 共有先はここでは指定しない。X・Instagram・LINE・写真アプリへの保存まで、ユーザーが
 * 共有シートから選ぶ。特定アプリを直接開く方式（Linking.openURL）だと、Xがintent URLでの
 * 画像添付に対応していないため肝心の画像が載らない。
 *
 * ハッシュタグは共有シートに渡すのと同時にクリップボードへも入れる。上記のとおり受け側が
 * テキストを拾わないことがあり、そのとき手で貼れる逃げ道が無いと詰むため。
 *
 * **react-native-shareは使わないこと。** New Architecture（bridgeless）では
 * `TurboModuleRegistry.getEnforcing(...): 'RNShare' could not be found` で起動時に落ちる
 * （このアプリは newArchEnabled: true。実機で再現確認済み）。RN標準のShareはCoreモジュールで、
 * 同じことが追加依存なしにできる。
 *
 * 失敗時は例外を投げる。呼び出し側で必ずcatchしてAlertを出すこと（共有シートを閉じただけの
 * ときは例外にせず'dismissed'を返す）。
 */
export async function shareProgressCard(
  cardRef: RefObject<View | null>,
  summary: ProgressShareSummary,
): Promise<ShareResult> {
  if (!cardRef.current) throw new Error('共有カードがまだ描画されていません');

  const uri = await captureRef(cardRef, {
    format: 'png',
    quality: 1,
    // 共有シートにファイルとして渡すのでtmpfile。base64にするとメモリに画像全体を載せることになる
    result: 'tmpfile',
  });

  const message = buildShareText(summary);
  // 共有シートを開く前にコピーしておく（開いた後だとアプリが背面に回って実行が遅れる）
  await Clipboard.setStringAsync(message);

  const result = await Share.share({
    message,
    // urlはiOS専用。Androidのshareは画像を運べないので、テキストだけが飛ぶ
    // （Androidでも画像を送るならexpo-sharing等が別途要る。iOS優先で今は割り切る）
    ...(Platform.OS === 'ios'
      ? { url: uri.startsWith('file://') ? uri : `file://${uri}` }
      : null),
  });

  return result.action === Share.sharedAction ? 'shared' : 'dismissed';
}
