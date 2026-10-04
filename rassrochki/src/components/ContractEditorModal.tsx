"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buildContractHtml, generateContractPdf } from "@/lib/contract";

export function ContractEditorModal({
  title,
  initialBody,
  onClose,
  formattedSample,
}: {
  title: string;
  initialBody: string;
  onClose: () => void;
  formattedSample?: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [activeTab, setActiveTab] = useState<"preview" | "text">(
    formattedSample ? "preview" : "text"
  );
  const [previewScale, setPreviewScale] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewTabRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (activeTab === "text") textareaRef.current?.focus();
    else previewTabRef.current?.focus();
  }, [activeTab]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!formattedSample || activeTab !== "preview") return;
    function onPreviewKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    const frame = previewRef.current;
    if (!frame) return;
    let boundWindow: Window | null = null;
    const bindFrameWindow = () => {
      boundWindow?.removeEventListener("keydown", onPreviewKey);
      try {
        boundWindow = frame.contentWindow;
        boundWindow?.addEventListener("keydown", onPreviewKey);
      } catch {
        boundWindow = null;
      }
    };
    frame.addEventListener("load", bindFrameWindow);
    // The srcDoc may finish loading before this effect runs.
    bindFrameWindow();
    return () => {
      frame.removeEventListener("load", bindFrameWindow);
      boundWindow?.removeEventListener("keydown", onPreviewKey);
      boundWindow = null;
    };
  }, [activeTab, body, formattedSample, onClose, title]);

  useEffect(() => {
    if (!formattedSample || activeTab !== "preview") return;
    const container = previewContainerRef.current;
    if (!container) return;

    const pageWidth = (210 * 96) / 25.4;
    const updateScale = () => {
      setPreviewScale(Math.min(1, container.clientWidth / pageWidth));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeTab, formattedSample]);

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
          {formattedSample && (
            <div className="mb-3 flex gap-2" role="tablist" aria-label="Режим договора">
              <button
                type="button"
                ref={previewTabRef}
                role="tab"
                aria-selected={activeTab === "preview"}
                className={activeTab === "preview" ? "btn-primary" : "btn-secondary"}
                onClick={() => setActiveTab("preview")}
              >
                Предпросмотр
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "text"}
                className={activeTab === "text" ? "btn-primary" : "btn-secondary"}
                onClick={() => setActiveTab("text")}
              >
                Текст
              </button>
            </div>
          )}
          {formattedSample && activeTab === "preview" ? (
            <div
              ref={previewContainerRef}
              className="h-[68vh] min-h-[320px] w-full overflow-auto rounded-lg border bg-[#eef1ef]"
            >
              <div
                className="relative mx-auto"
                style={{
                  width: `${((210 * 96) / 25.4) * previewScale}px`,
                  height: `${((297 * 96) / 25.4) * previewScale}px`,
                }}
              >
                <iframe
                  ref={previewRef}
                  title="Предпросмотр договора"
                  srcDoc={buildContractHtml(title, body, "sample")}
                  className="absolute left-0 top-0 max-w-none border-0"
                  style={{
                    width: "210mm",
                    height: "297mm",
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                  }}
                />
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
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
              generateContractPdf(title, body, formattedSample ? "sample" : "plain");
            }}
          >
            Печать
          </button>
        </div>
      </div>
    </div>
  );
}
