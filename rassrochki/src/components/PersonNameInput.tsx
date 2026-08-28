"use client";

import { sanitizePersonName } from "@/lib/input-sanitize";

type PersonNameInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
  disabled?: boolean;
};

export function PersonNameInput({
  value,
  onChange,
  className = "input",
  placeholder,
  required,
  id,
  disabled,
}: PersonNameInputProps) {
  return (
    <input
      id={id}
      className={className}
      type="text"
      autoComplete="name"
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      required={required}
      onChange={(e) => onChange(sanitizePersonName(e.target.value))}
    />
  );
}
