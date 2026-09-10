"use client";

export function AuthAlert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  if (children == null || children === false || children === "") return null;
  return (
    <p
      key={typeof children === "string" ? `${tone}:${children}` : tone}
      className={`auth-alert auth-alert--${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {children}
    </p>
  );
}
