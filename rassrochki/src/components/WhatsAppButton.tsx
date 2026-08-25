"use client";

import { buildWhatsAppUrl } from "@/lib/whatsapp";

export function WhatsAppButton({
  phone,
  text,
  label = "WhatsApp",
  className = "btn-secondary text-xs",
  disabledReason,
}: {
  phone: string | null | undefined;
  text?: string;
  label?: string;
  className?: string;
  disabledReason?: string;
}) {
  const href = buildWhatsAppUrl(phone, text);

  if (!href) {
    return (
      <span
        className="inline-flex cursor-not-allowed items-center rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-slate-400"
        title={disabledReason || "Укажите телефон клиента"}
      >
        WhatsApp
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {label}
    </a>
  );
}
