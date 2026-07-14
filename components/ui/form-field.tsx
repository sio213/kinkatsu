import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useFormScrollRegistration } from './form-scroll-context';
import { FormErrorText } from './form-error-text';
import { FormLabel } from './form-label';
import { SectionGroup } from './section-group';

type Props = {
  // useFormのfield名(Controller/registerに渡すnameと同じもの)。バリデーションエラー時の
  // 自動スクロール(components/ui/form-scroll-context.tsx)がこの名前でエラーの有無を突き合わせる。
  // フォーム外(種目詳細画面のセクション表示等)で使う場合は省略してよく、その場合は
  // 自動スクロールの対象から外れるだけで他の見た目・挙動に影響は無い
  name?: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: ReactNode;
};

// 見出し(FormLabel)+本文+エラーメッセージの1フィールド分をまとめた単位。
// 各フォームでSectionGroup+FormLabel+errorTextを毎回組み立てていた重複を解消する。
// フィールドを並べたときの間隔(FormFieldStackのgap16)は呼び出し側の親が持つ。
export function FormField({ name, label, required = false, optional = false, error, children }: Props) {
  const ref = useRef<View>(null);
  useFormScrollRegistration(name, ref);

  return (
    <SectionGroup ref={ref}>
      <FormLabel required={required} optional={optional}>
        {label}
      </FormLabel>
      {children}
      {error ? <FormErrorText>{error}</FormErrorText> : null}
    </SectionGroup>
  );
}
