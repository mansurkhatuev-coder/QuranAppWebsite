import Link from "next/link";

export function BackLink({
  href,
  label = "Назад",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
    >
      <span aria-hidden="true" className="text-lg leading-none text-teal-700">←</span>
      {label}
    </Link>
  );
}
