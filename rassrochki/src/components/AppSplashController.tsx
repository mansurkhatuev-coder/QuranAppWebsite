"use client";

import { useEffect } from "react";

const HIDE_MS = 420;

/**
 * Скрывает #app-splash после первого кадра приложения.
 * Сам markup splash — в layout (чтобы был до гидрации React).
 */
export function AppSplashController() {
  useEffect(() => {
    const el = document.getElementById("app-splash");
    if (!el) return;

    let done = false;
    const hide = () => {
      if (done) return;
      done = true;
      el.classList.add("app-splash--hide");
      window.setTimeout(() => el.remove(), HIDE_MS + 80);
    };

    // Даём браузеру отрисовать первый paint приложения
    const ric =
      "requestIdleCallback" in window
        ? window.requestIdleCallback(() => hide(), { timeout: 900 })
        : null;
    const t = window.setTimeout(hide, 700);
    const onLoad = () => hide();
    if (document.readyState === "complete") {
      window.setTimeout(hide, 120);
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("load", onLoad);
      if (ric != null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(ric);
      }
    };
  }, []);

  return null;
}
