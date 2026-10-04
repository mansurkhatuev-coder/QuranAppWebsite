"use client";

/**
 * Печать договора. В PWA (standalone) window.open часто «запирает» экран —
 * поэтому печатаем через скрытый iframe и даём явный fallback с кнопкой «Закрыть».
 */
export type ContractRenderMode = "plain" | "sample";

const SAMPLE_TEXT_ESCAPE = "\uE000";
const SAMPLE_TEXT_END = "\uE001";

export function protectSampleContractText(value: string) {
  return value.replace(/[|\uE000\uE001]/g, (character) => {
    const code = character === "|" ? "p" : character === SAMPLE_TEXT_ESCAPE ? "0" : "1";
    return `${SAMPLE_TEXT_ESCAPE}${code}${SAMPLE_TEXT_END}`;
  });
}

export function generateContractPdf(
  title: string,
  body: string,
  mode: ContractRenderMode = "plain"
) {
  const html = buildContractHtml(title, body, mode);

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
            openContractOverlay(html);
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

  openContractOverlay(html);
}

function openContractOverlay(html: string) {
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

  const preview = document.createElement("iframe");
  preview.title = "Предпросмотр договора";
  preview.srcdoc = html;
  preview.style.cssText = "display:block;width:100%;height:calc(100vh - 90px);border:0;";

  const printBtn = document.createElement("button");
  printBtn.type = "button";
  printBtn.textContent = "Печать";
  printBtn.style.cssText =
    "border:0;border-radius:12px;padding:10px 16px;background:#0f766e;color:#fff;font-weight:600;";
  printBtn.onclick = () => preview.contentWindow?.print();

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Закрыть";
  closeBtn.style.cssText =
    "border:1px solid #e2e8f0;border-radius:12px;padding:10px 16px;background:#fff;font-weight:600;";
  closeBtn.onclick = () => overlay.remove();

  toolbar.append(printBtn, closeBtn);

  overlay.append(toolbar, preview);
  document.body.appendChild(overlay);
  closeBtn.focus();
}

export function buildContractHtml(
  title: string,
  body: string,
  mode: ContractRenderMode = "plain"
) {
  const isSample = mode === "sample";
  const content = isSample ? renderSampleBody(body) : `<div>${escapeHtml(body)}</div>`;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    html { background: #eef1ef; }
    body { margin: 0; }
    .contract-document { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 15mm 20mm; background: #fff; box-shadow: 0 2px 18px #14201c24; font-family: "Times New Roman", Times, serif; font-size: 14px; line-height: 1.45; color: #111; white-space: pre-wrap; }
    h1 { font-size: 18px; margin: 0 0 16px; }
    ${isSample ? `
    .contract-document { white-space: normal; }
    h1 { text-align: center; }
    .sample p { margin: 0 0 10px; }
    .sample h1, .sample h2 { text-align: center; }
    .sample h1 { font-size: 18px; margin: 18px 0 12px; }
    .sample h2 { font-size: 16px; margin: 16px 0 10px; }
    .sample .badge { width: fit-content; max-width: 100%; margin: 0 auto 18px; padding: 5px 16px; border-radius: 999px; background: #203b35; color: #fff; font-weight: bold; letter-spacing: .08em; text-align: center; }
    .sample table { width: 100%; margin: 12px 0 16px; border-collapse: collapse; }
    .sample th, .sample td { border: 1px solid #65756f; padding: 6px 8px; text-align: left; vertical-align: top; }
    .sample th { background: #263e38; color: #fff; font-weight: bold; }
    .sample .payment-schedule tr { break-inside: avoid; page-break-inside: avoid; }
    .sample .payment-schedule-heading { break-after: avoid; page-break-after: avoid; }
    .sample .signature-block { break-inside: avoid; page-break-inside: avoid; }
    .sample .signature-heading { break-after: avoid; page-break-after: avoid; }
    ` : ""}
    @page { size: A4; margin: 15mm 20mm; }
    @media print {
      html { background: #fff; }
      body { margin: 0; }
      .contract-document { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
      .sample .badge, .sample th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="contract-document">
  ${isSample
    ? `<main class="sample">${content}</main>`
    : `<h1>${escapeHtml(title)}</h1>
  <div>${escapeHtml(body)}</div>`}
  </div>
</body>
</html>`;
}

function renderSampleBody(body: string) {
  const lines = body.split(/\r?\n/);
  const output: string[] = [];
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const [header, ...rows] = tableRows;
    const previousBlock = output[output.length - 1] ?? "";
    const tableClasses = [
      /ГРАФИК ПЛАТЕЖЕЙ/i.test(previousBlock) ? "payment-schedule" : "",
      /ПОДПИСИ СТОРОН/i.test(previousBlock) ? "signature-block" : "",
    ].filter(Boolean);
    const classAttribute = tableClasses.length
      ? ` class="${tableClasses.join(" ")}"`
      : "";
    output.push(
      `<table${classAttribute}><thead><tr>${header.map((cell) => `<th>${renderCell(cell)}</th>`).join("")}</tr></thead><tbody>${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderCell(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`
    );
    tableRows = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      tableRows.push(cells);
      continue;
    }
    flushTable();
    if (!trimmed) continue;
    if (trimmed.startsWith("! ")) {
      output.push(`<p class="badge">${escapeSampleText(trimmed.slice(2))}</p>`);
    } else if (trimmed.startsWith("## ")) {
      const heading = trimmed.slice(3);
      const headingClasses = [
        /ГРАФИК ПЛАТЕЖЕЙ/i.test(heading) ? "payment-schedule-heading" : "",
        /ПОДПИСИ СТОРОН/i.test(heading) ? "signature-heading" : "",
      ].filter(Boolean);
      const classAttribute = headingClasses.length
        ? ` class="${headingClasses.join(" ")}"`
        : "";
      output.push(`<h2${classAttribute}>${escapeSampleText(heading)}</h2>`);
    } else if (trimmed.startsWith("# ")) {
      output.push(`<h1>${escapeSampleText(trimmed.slice(2))}</h1>`);
    } else {
      output.push(`<p>${escapeSampleText(trimmed)}</p>`);
    }
  }
  flushTable();
  return output.join("\n");
}

function renderCell(cell: string) {
  return cell.split("<br>").map(escapeSampleText).join("<br>");
}

function escapeSampleText(value: string) {
  return escapeHtml(value).replace(
    /\uE000([p01])\uE001/g,
    (_match, code: string) =>
      code === "p" ? "|" : code === "0" ? SAMPLE_TEXT_ESCAPE : SAMPLE_TEXT_END
  );
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
