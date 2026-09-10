"use client";

import { useId, useState, type ChangeEvent, type KeyboardEvent } from "react";

type Props = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  name?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  hint?: React.ReactNode;
};

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  name = "password",
  required,
  minLength,
  disabled,
  placeholder,
  autoFocus,
  hint,
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [focused, setFocused] = useState(false);

  function checkCaps(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <div className={`auth-field ${focused ? "auth-field--focused" : ""}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="label mb-0" htmlFor={inputId}>
          {label}
        </label>
        {hint}
      </div>
      <div className="relative">
        <input
          id={inputId}
          className="input auth-input pr-12"
          type={visible ? "text" : "password"}
          name={name}
          value={value}
          onChange={handleChange}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setCapsLock(false);
          }}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          disabled={disabled}
          placeholder={placeholder}
          autoFocus={autoFocus}
          spellCheck={false}
        />
        <button
          type="button"
          className="auth-eye"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={visible}
          tabIndex={0}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {capsLock && (
        <p className="auth-caps" role="status">
          Включён Caps Lock
        </p>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.8M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-2.2 3.1M6.1 6.1C3.7 7.8 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
