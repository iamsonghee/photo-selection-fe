import { forwardRef, type ChangeEvent, type InputHTMLAttributes } from "react";
import { Input } from "./Input";
import { formatKoreanPhoneInput } from "@/lib/phone";

interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
}

/**
 * 010-0000-0000 형식 전화번호 입력 — 숫자 외 문자는 입력되지 않고, 숫자를 입력하면 "-"가 자동으로 붙는다.
 * label/error를 넘기면 공용 Input과 동일한 라벨/에러 UI로 렌더링하고, 넘기지 않으면 각 화면의
 * 기존 className(모달/설정 등 서로 다른 스타일)을 그대로 쓸 수 있도록 순수 input을 렌더링한다.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, label, error, placeholder = "010-0000-0000", inputMode = "numeric", ...props }, ref) => {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      onChange(formatKoreanPhoneInput(e.target.value));
    };

    if (label !== undefined || error !== undefined) {
      return (
        <Input
          ref={ref}
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          label={label}
          error={error}
          {...props}
        />
      );
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        {...props}
      />
    );
  }
);
PhoneInput.displayName = "PhoneInput";
