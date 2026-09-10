"use client";

import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden />
      <div className="auth-card-wrap">
        <div className="auth-brand">
          <Link href="/" className="auth-brand-mark">
            Рассрочки
          </Link>
        </div>
        <div className="card auth-card">
          <header className="auth-header">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
          </header>
          {children}
          {footer ? <div className="auth-footer">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
