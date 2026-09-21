"use client";

import { useEffect, useId, useRef, useState } from "react";
import { generateContractPdf } from "@/lib/contract";

export function ContractEditorModal({
  title,
  initialBody,
  onClose,
}: {
  title: string;
  initialBody: string;
  onClose: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 id={titleId} className="font-semibold">
              Договор
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Отредактируйте текст под эту рассрочку, затем напечатайте
            </p>
          </div>
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          <label className="label" htmlFor="contract-body">
            Текст договора
          </label>
          <textarea
            id="contract-body"
            ref={textareaRef}
            className="input min-h-[50vh] font-serif text-sm leading-relaxed"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!body.trim()}
            onClick={() => {
              generateContractPdf(title, body);
            }}
          >
            Печать
          </button>
        </div>
      </div>
    </div>
  );
}
