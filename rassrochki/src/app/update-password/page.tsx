"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { PasswordField } from "@/components/auth/PasswordField";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function check() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(Boolean(data.session));
      setReady(true);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(true);
        setReady(true);
      }
    });

    void check();
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }
    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(friendlyError("Не удалось обновить пароль", updateError));
      return;
    }

    setSuccess("Пароль обновлён. Переходим в приложение…");
    window.setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 700);
  }

  return (
    <AuthShell
      title="Новый пароль"
      subtitle="Придумайте новый пароль для входа"
      footer={
        <p className="text-center text-sm text-[var(--muted)]">
          <Link className="auth-link" href="/login">
            Вернуться ко входу
          </Link>
        </p>
      }
    >
      {!ready ? (
        <p className="text-sm text-[var(--muted)]">Проверяем ссылку…</p>
      ) : !hasSession ? (
        <div className="space-y-4">
          <AuthAlert>
            Ссылка недействительна или устарела. Запросите новую на странице восстановления.
          </AuthAlert>
          <Link className="btn-primary auth-submit inline-flex w-full" href="/forgot-password">
            Восстановить пароль
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="auth-form" noValidate>
          <AuthAlert>{error}</AuthAlert>
          <AuthAlert tone="success">{success}</AuthAlert>
          <div className="space-y-2">
            <PasswordField
              id="password"
              label="Новый пароль"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              name="new-password"
              minLength={6}
              required
              disabled={loading || Boolean(success)}
              autoFocus
            />
            <PasswordStrength password={password} />
          </div>
          <PasswordField
            id="confirmPassword"
            label="Повторите пароль"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            name="confirm-password"
            minLength={6}
            required
            disabled={loading || Boolean(success)}
          />
          <AuthSubmitButton
            loading={loading}
            loadingLabel="Сохраняем…"
            disabled={Boolean(success)}
          >
            Сохранить пароль
          </AuthSubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
