"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/Spinner";
import { PersonNameInput } from "@/components/PersonNameInput";
import { friendlyError } from "@/lib/friendly";

export default function OnboardingPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: orgError } = await supabase.rpc("create_organization_for_user", {
      org_name: orgName,
      user_full_name: fullName || null,
    });
    setLoading(false);
    if (orgError) {
      setError(friendlyError("Не удалось создать организацию. Попробуйте ещё раз", orgError));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Создайте организацию</h1>
        <p className="text-sm text-[var(--muted)]">
          Аккаунт есть — укажите название вашей организации.
        </p>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div>
          <label className="label">Название организации</label>
          <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Ваше имя</label>
          <PersonNameInput value={fullName} onChange={setFullName} />
        </div>
        <button className="btn-primary w-full" type="submit" disabled={loading}>
          {loading ? <Spinner label="Сохраняем…" /> : "Продолжить"}
        </button>
      </form>
    </div>
  );
}
