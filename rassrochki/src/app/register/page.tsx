"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    orgName: "",
    fullName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      setLoading(false);
      setError("Проверьте почту и подтвердите регистрацию, затем войдите.");
      return;
    }

    const { error: orgError } = await supabase.rpc("create_organization_for_user", {
      org_name: form.orgName,
      user_full_name: form.fullName || null,
    });

    setLoading(false);
    if (orgError) {
      setError(orgError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <form onSubmit={onSubmit} className="card w-full max-w-md space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Регистрация</h1>
          <p className="text-sm text-[var(--muted)]">
            30 дней бесплатно — создайте организацию и начните учёт
          </p>
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div>
          <label className="label">Название организации</label>
          <input
            className="input"
            value={form.orgName}
            onChange={(e) => setForm({ ...form, orgName: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Ваше имя</label>
          <input
            className="input"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Пароль</label>
          <input
            className="input"
            type="password"
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>
        <button className="btn-primary w-full" type="submit" disabled={loading}>
          {loading ? "Создаём…" : "Создать аккаунт"}
        </button>
        <p className="text-center text-sm text-[var(--muted)]">
          Уже есть аккаунт?{" "}
          <Link className="text-teal-700 underline" href="/login">
            Войти
          </Link>
        </p>
      </form>
    </div>
  );
}
