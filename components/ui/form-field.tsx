import type { ReactNode } from 'react';
import { FormErrorText } from './form-error-text';
import { FormLabel } from './form-label';
import { SectionGroup } from './section-group';

type Props = {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: ReactNode;
};

// 見出し(FormLabel)+本文+エラーメッセージの1フィールド分をまとめた単位。
// 各フォームでSectionGroup+FormLabel+errorTextを毎回組み立てていた重複を解消する。
// フィールドを並べたときの間隔(FormFieldStackのgap16)は呼び出し側の親が持つ。
export function FormField({ label, required = false, optional = false, error, children }: Props) {
  return (
    <SectionGroup>
      <FormLabel required={required} optional={optional}>
        {label}
      </FormLabel>
      {children}
      {error ? <FormErrorText>{error}</FormErrorText> : null}
    </SectionGroup>
  );
}
