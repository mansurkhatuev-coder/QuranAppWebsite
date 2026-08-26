"use client";

/**
 * Печать договора. В PWA (standalone) window.open часто «запирает» экран —
 * поэтому печатаем через скрытый iframe и даём явный fallback с кнопкой «Закрыть».
 */
export function generateContractPdf(title: string, body: string) {
  const html = buildContractHtml(title, body);

  // 1) iframe — остаёмся в том же окне PWA
  try {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      const cleanup = () => {
        window.setTimeout(() => {
          try {
            iframe.remove();
          } catch {
            /* ignore */
          }
        }, 1000);
      };

      const win = iframe.contentWindow;
      if (win) {
        win.focus();
        const onAfter = () => {
          win.removeEventListener("afterprint", onAfter);
          cleanup();
        };
        win.addEventListener("afterprint", onAfter);
        window.setTimeout(() => {
          try {
            win.print();
          } catch {
            cleanup();
            openContractOverlay(title, body);
          }
        }, 50);
        // iOS sometimes never fires afterprint
        window.setTimeout(cleanup, 60_000);
        return;
      }
    }
    iframe.remove();
  } catch {
    /* fall through */
  }

  openContractOverlay(title, body);
}

function openContractOverlay(title: string, body: string) {
  const existing = document.getElementById("contract-print-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "contract-print-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:10000;background:#fff;overflow:auto;padding:16px;font-family:system-ui,sans-serif;";

  const toolbar = document.createElement("div");
  toolbar.style.cssText =
    "position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;padding:8px 0 12px;background:#fff;border-bottom:1px solid #e2e8f0;margin-bottom:12px;";

  const printBtn = document.createElement("button");
  printBtn.type = "button";
  printBtn.textContent = "Печать";
  printBtn.style.cssText =
    "border:0;border-radius:12px;padding:10px 16px;background:#0f766e;color:#fff;font-weight:600;";
  printBtn.onclick = () => window.print();

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Закрыть";
  closeBtn.style.cssText =
    "border:1px solid #e2e8f0;border-radius:12px;padding:10px 16px;background:#fff;font-weight:600;";
  closeBtn.onclick = () => overlay.remove();

  toolbar.append(printBtn, closeBtn);

  const article = document.createElement("article");
  article.style.cssText =
    "white-space:pre-wrap;font-family:'Times New Roman',Times,serif;font-size:14px;line-height:1.45;color:#111;";
  const h1 = document.createElement("h1");
  h1.textContent = title;
  h1.style.cssText = "font-size:18px;margin:0 0 16px;";
  const pre = document.createElement("div");
  pre.textContent = body;
  article.append(h1, pre);

  overlay.append(toolbar, article);
  document.body.appendChild(overlay);
  closeBtn.focus();
}

function buildContractHtml(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; font-size: 14px; line-height: 1.45; padding: 24px; color: #111; white-space: pre-wrap; }
    h1 { font-size: 18px; margin: 0 0 16px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div>${escapeHtml(body)}</div>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fillContractTemplate(
  template: string,
  vars: Record<string, string>
) {
  return Object.entries(vars).reduce(
    (text, [key, val]) => text.replaceAll(`{${key}}`, val),
    template
  );
}

export function formatScheduleForContract(
  schedules: {
    sequence_number: number;
    due_date: string;
    amount: number;
    status: string;
    paid_at: string | null;
    paid_amount: number | null;
  }[],
  formatDate: (d: string) => string,
  formatMoney: (n: number) => string
) {
  return schedules
    .map((s) => {
      const base = `${s.sequence_number}. ${formatDate(s.due_date)} — ${formatMoney(Number(s.amount))}`;
      if (s.status === "paid") {
        const paid = s.paid_amount != null ? formatMoney(Number(s.paid_amount)) : formatMoney(Number(s.amount));
        const when = s.paid_at ? formatDate(s.paid_at.slice(0, 10)) : "";
        return `${base} · оплачен${when ? ` ${when}` : ""} (${paid})`;
      }
      if (s.paid_amount != null && Number(s.paid_amount) > 0) {
        return `${base} · внесено ${formatMoney(Number(s.paid_amount))}`;
      }
      if (s.status === "overdue") return `${base} · просрочен`;
      return `${base} · ожидает`;
    })
    .join("\n");
}
