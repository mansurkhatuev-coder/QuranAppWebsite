"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { PasswordField } from "@/components/auth/PasswordField";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly";

const EMAIL_KEY = "rassrochki:last-login-email";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      // ignore
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      setLoading(false);
      setError(friendlyError("Не удалось войти. Проверьте email и пароль", authError));
      return;
    }
    try {
      localStorage.setItem(EMAIL_KEY, email.trim());
    } catch {
      // ignore
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell
      title="Вход"
      subtitle="Учёт рассрочек для вашей организации"
      footer={
        <p className="text-center text-sm text-[var(--muted)]">
          Нет аккаунта?{" "}
          <Link className="auth-link" href="/register">
            Регистрация
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="auth-form" noValidate>
        <AuthAlert>{error}</AuthAlert>
        <div className={`auth-field ${email ? "auth-field--filled" : ""}`}>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input auth-input"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            required
            disabled={loading}
            autoFocus={!email}
            placeholder="you@example.com"
          />
        </div>
        <PasswordField
          id="password"
          label="Пароль"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
          disabled={loading}
          autoFocus={Boolean(email)}
          hint={
            <Link className="auth-link text-xs" href="/forgot-password">
              Забыли пароль?
            </Link>
          }
        />
        <AuthSubmitButton loading={loading} loadingLabel="Входим…">
          Войти
        </AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
