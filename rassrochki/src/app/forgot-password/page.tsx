"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "https://halal-rass.vercel.app";

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/update-password`,
    });

    setLoading(false);
    if (resetError) {
      setError(friendlyError("Не удалось отправить письмо", resetError));
      return;
    }
    setSuccess("Если такой email есть в системе, мы отправили ссылку для смены пароля.");
  }

  return (
    <AuthShell
      title="Восстановление пароля"
      subtitle="Укажите email — пришлём ссылку для смены пароля"
      footer={
        <p className="text-center text-sm text-[var(--muted)]">
          Вспомнили пароль?{" "}
          <Link className="auth-link" href="/login">
            Войти
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="auth-form" noValidate>
        <AuthAlert>{error}</AuthAlert>
        <AuthAlert tone="success">{success}</AuthAlert>
        <div className="auth-field">
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
            disabled={loading || Boolean(success)}
            autoFocus
            placeholder="you@example.com"
          />
        </div>
        <AuthSubmitButton
          loading={loading}
          loadingLabel="Отправляем…"
          disabled={Boolean(success)}
        >
          Отправить ссылку
        </AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
