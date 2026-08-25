"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // ignore register errors in dev
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
  }, []);

  return null;
}
