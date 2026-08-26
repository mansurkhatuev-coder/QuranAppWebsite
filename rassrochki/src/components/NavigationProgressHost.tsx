"use client";

import { Suspense } from "react";
import { NavigationProgress } from "@/components/NavigationProgress";

/** Suspense нужен из‑за useSearchParams в NavigationProgress. */
export function NavigationProgressHost() {
  return (
    <Suspense fallback={null}>
      <NavigationProgress />
    </Suspense>
  );
}
