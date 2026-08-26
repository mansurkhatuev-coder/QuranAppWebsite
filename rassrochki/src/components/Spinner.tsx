export function Spinner({
  className = "h-4 w-4",
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <svg
        className={`animate-spin text-current ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V2C5.373 2 2 5.373 2 12h2z"
        />
      </svg>
      {label ? <span>{label}</span> : <span className="sr-only">Загрузка</span>}
    </span>
  );
}
