"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { DraftIndicator } from "@/components/ui";
import { PhoneInput } from "@/components/PhoneInput";
import { PersonNameInput } from "@/components/PersonNameInput";
import { useDraft } from "@/hooks/useDraft";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/Spinner";
import { friendlyError } from "@/lib/friendly";

type ClientDraft = {
  full_name: string;
  phone: string;
  notes: string;
};

const initial: ClientDraft = { full_name: "", phone: "", notes: "" };

export default function NewClientPage() {
  const router = useRouter();
  const { value, setValue, status, clearDraft } = useDraft<ClientDraft>("draft:new-client", initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Войдите в аккаунт");
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      setError("Не удалось продолжить. Выйдите и войдите снова");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("clients").insert({
      full_name: value.full_name.trim(),
      phone: value.phone.trim() || null,
      notes: value.notes.trim() || null,
      organization_id: profile.organization_id,
      is_blacklisted: false,
    });

    setLoading(false);
    if (insertError) {
      setError(friendlyError("Не удалось сохранить клиента", insertError));
      return;
    }
    clearDraft();
    router.push("/clients");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Новый клиент</h1>
        <DraftIndicator status={status} />
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="card space-y-4">
        <div>
          <label className="label">ФИО</label>
          <PersonNameInput
            value={value.full_name}
            onChange={(full_name) => setValue({ ...value, full_name })}
            required
          />
        </div>
        <div>
          <label className="label">Телефон</label>
          <PhoneInput value={value.phone} onChange={(phone) => setValue({ ...value, phone })} />
        </div>
        <div>
          <label className="label">Заметки</label>
          <textarea
            className="input min-h-24"
            value={value.notes}
            onChange={(e) => setValue({ ...value, notes: e.target.value })}
          />
        </div>
      </div>
      <button className="btn-primary w-full md:w-auto" type="submit" disabled={loading}>
        {loading ? <Spinner label="Сохраняем…" /> : "Сохранить"}
      </button>
    </form>
  );
}
