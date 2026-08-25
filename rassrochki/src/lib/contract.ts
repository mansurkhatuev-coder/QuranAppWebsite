"use client";

/**
 * Печать/сохранение договора с кириллицей через браузер (jsPDF без шрифта ломает русский).
 */
export function generateContractPdf(title: string, body: string) {
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
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
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    // fallback: скачать как .txt
    const blob = new Blob([`${title}\n\n${body}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
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
