import { statusLabelRu } from "@/lib/friendly";

export function StatusBadge({ status }: { status: string }) {
  if (status === "paid") return <span className="badge-green">Оплачен</span>;
  if (status === "overdue") return <span className="badge-red">Просрочен</span>;
  if (status === "pending") return <span className="badge-yellow">Ожидает</span>;
  if (status === "active") return <span className="badge-green">Активна</span>;
  if (status === "closed") return <span className="badge-yellow">Закрыта</span>;
  return <span className="badge">{statusLabelRu(status)}</span>;
}

export function DraftIndicator({ status }: { status: "idle" | "saved" | "saving" }) {
  if (status === "saving") return <p className="text-xs text-[var(--muted)]">Сохраняем…</p>;
  if (status === "saved") return <p className="text-xs text-emerald-700">Черновик сохранён</p>;
  return null;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="card text-center">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
    </div>
  );
}
