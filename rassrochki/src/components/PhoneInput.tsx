"use client";

import { formatPhoneRu } from "@/lib/phone";

type PhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
  disabled?: boolean;
};

export function PhoneInput({
  value,
  onChange,
  className = "input",
  placeholder = "+7 (___) ___-__-__",
  required,
  id,
  disabled,
}: PhoneInputProps) {
  return (
    <input
      id={id}
      className={className}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder={placeholder}
      value={formatPhoneRu(value)}
      disabled={disabled}
      required={required}
      onChange={(e) => onChange(formatPhoneRu(e.target.value))}
    />
  );
}
