"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = localStorage.getItem("rassrochki:pwa-banner-dismissed") === "1";
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    if (standalone || dismissed) return;

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua);
    setIsIos(ios);
    if (ios) {
      setHidden(false);
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  function dismiss() {
    localStorage.setItem("rassrochki:pwa-banner-dismissed", "1");
    setHidden(true);
    setDeferred(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (hidden) return null;

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">Установить «Рассрочки»</p>
          <p className="mt-0.5 text-xs text-teal-800/90">
            {isIos
              ? "На iPhone: «Поделиться» → «На экран Домой»"
              : "Добавьте на экран телефона — как обычное приложение"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!isIos && deferred && (
            <button type="button" className="btn-primary text-xs" onClick={install}>
              Установить
            </button>
          )}
          <button type="button" className="btn-secondary text-xs" onClick={dismiss}>
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
