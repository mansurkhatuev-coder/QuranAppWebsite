"use client";

import { Spinner } from "@/components/Spinner";

export function AuthSubmitButton({
  loading,
  loadingLabel,
  children,
  disabled,
}: {
  loading: boolean;
  loadingLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className={`btn-primary auth-submit w-full ${loading ? "auth-submit--loading" : ""}`}
      type="submit"
      disabled={disabled || loading}
      aria-busy={loading}
    >
      {loading ? <Spinner label={loadingLabel} /> : children}
    </button>
  );
}
