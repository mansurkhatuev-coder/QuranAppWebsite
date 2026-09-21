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
      className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-900"
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
