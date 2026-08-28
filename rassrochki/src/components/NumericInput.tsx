"use client";

import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/lib/input-sanitize";

type NumericInputProps = {
  value: string;
  onChange: (value: string) => void;
  mode: "integer" | "decimal";
  className?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
  disabled?: boolean;
};

export function NumericInput({
  value,
  onChange,
  mode,
  className = "input",
  placeholder,
  required,
  id,
  disabled,
}: NumericInputProps) {
  return (
    <input
      id={id}
      className={className}
      type="text"
      inputMode={mode === "integer" ? "numeric" : "decimal"}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      required={required}
      onChange={(e) =>
        onChange(
          mode === "integer"
            ? sanitizeIntegerInput(e.target.value)
            : sanitizeDecimalInput(e.target.value)
        )
      }
    />
  );
}
