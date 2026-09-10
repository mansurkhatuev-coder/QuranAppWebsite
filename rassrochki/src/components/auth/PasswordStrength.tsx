"use client";

function scorePassword(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-ZА-Я]/.test(password) && /[a-zа-я]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-zА-Яа-я0-9]/.test(password)) score += 1;
  const clamped = Math.min(score, 4);
  const labels = ["Слабый", "Слабый", "Средний", "Хороший", "Надёжный"];
  return { score: clamped, label: labels[clamped] };
}

export function PasswordStrength({ password }: { password: string }) {
  const { score, label } = scorePassword(password);
  if (!password) return null;

  return (
    <div className="auth-strength" aria-live="polite">
      <div className="auth-strength-bars" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`auth-strength-bar ${i < score ? `is-${score}` : ""}`}
          />
        ))}
      </div>
      <p className="auth-strength-label">{label}</p>
    </div>
  );
}
