"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { PasswordField } from "@/components/auth/PasswordField";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { PersonNameInput } from "@/components/PersonNameInput";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    orgName: "",
    fullName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (form.password.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
    });

    if (signUpError) {
      setLoading(false);
      setError(friendlyError("Не удалось создать аккаунт", signUpError));
      return;
    }

    if (!data.session) {
      setLoading(false);
      setError("Проверьте почту и подтвердите регистрацию, затем войдите.");
      return;
    }

    const { error: orgError } = await supabase.rpc("create_organization_for_user", {
      org_name: form.orgName.trim(),
      user_full_name: form.fullName.trim() || null,
    });

    if (orgError) {
      setLoading(false);
      setError(friendlyError("Не удалось создать организацию", orgError));
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell
      title="Регистрация"
      subtitle="30 дней бесплатно — создайте организацию и начните учёт"
      footer={
        <p className="text-center text-sm text-[var(--muted)]">
          Уже есть аккаунт?{" "}
          <Link className="auth-link" href="/login">
            Войти
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="auth-form" noValidate>
        <AuthAlert>{error}</AuthAlert>
        <div className="auth-field">
          <label className="label" htmlFor="orgName">
            Название организации
          </label>
          <input
            id="orgName"
            className="input auth-input"
            name="organization"
            value={form.orgName}
            onChange={(e) => setForm({ ...form, orgName: e.target.value })}
            autoComplete="organization"
            required
            disabled={loading}
            autoFocus
          />
        </div>
        <div className="auth-field">
          <label className="label" htmlFor="fullName">
            Ваше имя
          </label>
          <PersonNameInput
            id="fullName"
            className="input auth-input"
            value={form.fullName}
            onChange={(fullName) => setForm({ ...form, fullName })}
            disabled={loading}
          />
        </div>
        <div className="auth-field">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input auth-input"
            type="email"
            name="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            autoComplete="email"
            inputMode="email"
            required
            disabled={loading}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <PasswordField
            id="password"
            label="Пароль"
            value={form.password}
            onChange={(password) => setForm({ ...form, password })}
            autoComplete="new-password"
            name="new-password"
            minLength={6}
            required
            disabled={loading}
          />
          <PasswordStrength password={form.password} />
        </div>
        <PasswordField
          id="confirmPassword"
          label="Повторите пароль"
          value={form.confirmPassword}
          onChange={(confirmPassword) => setForm({ ...form, confirmPassword })}
          autoComplete="new-password"
          name="confirm-password"
          minLength={6}
          required
          disabled={loading}
        />
        <AuthSubmitButton loading={loading} loadingLabel="Создаём…">
          Создать аккаунт
        </AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
