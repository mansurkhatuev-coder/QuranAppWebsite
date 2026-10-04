# Installment Contract Sample Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task with review checkpoints.

**Goal:** Use a polished built-in installment contract when an organization's saved contract template is blank, while keeping saved custom templates unchanged.

**Architecture:** Add a source-controlled sample template and a formatter for planned payment rows. Mark only the built-in sample as formatted; render its restricted text markup into escaped HTML for preview and printing, while the existing custom-template text path stays intact.

**Tech Stack:** Next.js 16, React 19, TypeScript, browser iframe printing, CSS print media.

---

### Task 1: Add the built-in sample and map loan data

**Files:**
- Create: `rassrochki/src/lib/default-contract.ts`
- Modify: `rassrochki/src/components/LoanDetail.tsx`

- [x] **Step 1: Add the sample text and payment-row formatter**

Create `default-contract.ts` with the sample content below. The formatter returns rows only, so contract reprints never insert live payment-status labels.

```ts
export const DEFAULT_CONTRACT_TEMPLATE = `! РАССРОЧКА
# ДОГОВОР КУПЛИ-ПРОДАЖИ ТОВАРА С ОПЛАТОЙ В РАССРОЧКУ
| г. __________ | № договора: __________ | Дата: {start_date} |
## СТОРОНЫ ДОГОВОРА
| ПРОДАВЕЦ | ПОКУПАТЕЛЬ |
| {organization}<br>Адрес: __________<br>Телефон: __________<br>Реквизиты: __________ | {client}<br>Телефон: {phone}<br>Поручитель: {guarantors} |
## ТОВАР И СТОИМОСТЬ
Товар: {product}
| Цена по договору | Первый взнос | Срок рассрочки |
| {amount} | {down_payment} | {term_months} месяцев |
## ГРАФИК ПЛАТЕЖЕЙ
| № | Дата платежа | Сумма | Подпись |
{payment_schedule}
Покупатель вправе досрочно оплатить оставшуюся сумму.
## УСЛОВИЯ ПРОСРОЧКИ
При просрочке платежей Продавец вправе требовать исполнения обязательств и применять способы защиты в случаях и порядке, предусмотренных законодательством. Возврат товара, взыскание задолженности и ответственность поручителя определяются законом и соглашением о поручительстве.
## ПОДПИСИ СТОРОН
| ПРОДАВЕЦ | ПОКУПАТЕЛЬ | ПОРУЧИТЕЛЬ |
| __________<br>Подпись / ФИО | __________<br>Подпись / ФИО | __________<br>Подпись / ФИО |`;

export function formatPaymentScheduleForContract(
  schedules: { sequence_number: number; due_date: string; amount: number }[],
  formatDate: (date: string) => string,
  formatMoney: (amount: number) => string
) {
  return schedules
    .map((row) => `| ${row.sequence_number} | ${formatDate(row.due_date)} | ${formatMoney(Number(row.amount))} | __________ |`)
    .join("\n") || "| — | — | — | — |";
}
```

- [x] **Step 2: Select the fallback and keep existing custom-template variables**

In `LoanDetail.tsx`, import the sample and formatter. In `openContractEditor`, keep the existing `scheduleText` and `{schedule}` mapping, then choose the template with a whitespace check and pass the new sample values:

```ts
const formattedSample = !settings.contract_template.trim();
const template = formattedSample
  ? DEFAULT_CONTRACT_TEMPLATE
  : settings.contract_template;
const body = fillContractTemplate(template, {
  organization: orgName,
  client: loan.clients?.full_name ?? "",
  phone: loan.clients?.phone ?? "",
  amount: formatMoney(Number(loan.principal)),
  down_payment: formatMoney(Number(loan.down_payment ?? 0)),
  financed: formatMoney(financed),
  term_months: String(loan.term_months),
  monthly_payment: formatMoney(Number(loan.monthly_payment)),
  start_date: formatDateShort(loan.start_date),
  schedule: scheduleText,
  payment_schedule: formatPaymentScheduleForContract(schedules, formatDateShort, formatMoney),
  product: loan.title?.trim() || "________________",
  paid_months: String(paidCount),
  manager_share: String(shares.manager),
  investor_share: String(shares.investor),
  investor: loan.investors?.name ?? "—",
  guarantors: guarantorsText,
});
setContractDraft({
  title: `Договор_${loan.clients?.full_name ?? "client"}`,
  body,
  formattedSample,
});
```

Extend the `contractDraft` state type with `formattedSample: boolean` and pass it to `ContractEditorModal`. For a saved custom template, `{schedule}` retains its current status-bearing format and printing mode.

### Task 2: Render and preview the formatted sample

**Files:**
- Modify: `rassrochki/src/lib/contract.ts`
- Modify: `rassrochki/src/components/ContractEditorModal.tsx`

- [x] **Step 1: Add one safe sample renderer shared by preview and print**

Export the document builder so the modal preview and print code share it. Change the printer to accept an optional mode and retain the current plain-text branch:

```ts
export type ContractRenderMode = "plain" | "sample";

export function buildContractHtml(
  title: string,
  body: string,
  mode: ContractRenderMode = "plain"
) {
  const isSample = mode === "sample";
  const content = isSample
    ? `<main class="sample">${renderSampleMarkup(body)}</main>`
    : `<h1>${escapeHtml(title)}</h1>
  <div>${escapeHtml(body)}</div>`;
  const sampleStyles = isSample ? `
    * { box-sizing: border-box; }
    html { background: #eef1ef; }
    body { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 15mm 20mm; background: #fff; box-shadow: 0 2px 18px #14201c24; white-space: normal; }
    .sample h1, .sample h2 { text-align: center; }
    .sample h1 { font-size: 18px; margin: 18px 0 12px; }
    .sample h2 { font-size: 16px; margin: 16px 0 10px; }
    .sample .badge { width: fit-content; max-width: 100%; margin: 0 auto 18px; padding: 5px 16px; border-radius: 999px; background: #203b35; color: #fff; font-weight: bold; letter-spacing: .08em; text-align: center; }
    .sample table { width: 100%; margin: 12px 0 16px; border-collapse: collapse; }
    .sample th, .sample td { border: 1px solid #65756f; padding: 6px 8px; text-align: left; vertical-align: top; }
    .sample th { background: #263e38; color: #fff; font-weight: bold; }
    @page { size: A4; margin: 15mm 20mm; }
    @media print { html { background: #fff; } body { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; } .sample .badge, .sample th { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  ` : `@media print { body { padding: 0; } }`;
  return `<!DOCTYPE html><html lang="ru"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title><style>
      body { color: #111; font: 14px/1.45 "Times New Roman", Times, serif; padding: 24px; white-space: pre-wrap; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      .sample p { margin: 0 0 10px; }
      ${sampleStyles}
    </style></head><body>
  ${content}
</body></html>`;
}

export function generateContractPdf(title: string, body: string, mode: ContractRenderMode = "plain") {
  const html = buildContractHtml(title, body, mode);
  // Keep the existing hidden-iframe print attempt and pass mode to the overlay fallback.
}
```

Implement `renderSampleMarkup` in the same module with this line parser. It converts `! ` to the dark centered “РАССРОЧКА” badge, `# ` and `## ` lines to centered headings, adjacent pipe rows to semantic tables, skips Markdown divider rows, and escapes every value. It permits only the literal `<br>` token in cells for seller and buyer details:

```ts
function renderSampleCell(value: string) {
  return value.split("<br>").map(escapeHtml).join("<br>");
}

function renderSampleMarkup(source: string) {
  const lines = source.split(/\r?\n/);
  const html: string[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) { i += 1; continue; }
    if (line.startsWith("! ")) {
      html.push(`<p class="badge">${escapeHtml(line.slice(2))}</p>`);
      i += 1;
      continue;
    }
    if (line.startsWith("# ")) {
      html.push(`<h1 class="contract-title">${escapeHtml(line.slice(2))}</h1>`);
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2 class="contract-section">${escapeHtml(line.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().slice(1, -1).split("|").map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) rows.push(cells);
        i += 1;
      }
      const [head = [], ...body] = rows;
      html.push(`<table><thead><tr>${head.map((cell) => `<th>${renderSampleCell(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderSampleCell(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    html.push(`<p>${escapeHtml(line)}</p>`);
    i += 1;
  }
  return html.join("\n");
}
```

The sample page uses a centered A4 canvas, two-column party table, compact totals, bordered payment rows, and a three-column signature row. On screen, keep a fixed 210 mm page with 15 mm vertical and 20 mm horizontal insets. Print with repeated `@page { size: A4; margin: 15mm 20mm }` and reset the body padding so every page keeps the same content width and margins. Keep this page geometry conditional on sample mode so custom templates retain their exact legacy body markup and print styling.

Pass `mode` through the existing hidden-iframe print attempt and its in-page fallback. Replace the fallback overlay's article with a visible iframe whose `srcdoc` is `buildContractHtml(title, body, mode)`; its print button calls that iframe's `contentWindow.print()`. The existing plain mode keeps the current Times New Roman text layout, and both modes share the same document builder.

- [x] **Step 2: Show a formatted preview for the built-in sample**

Add optional `formattedSample?: boolean` to `ContractEditorModal`. Initialize `view` to `preview` for the sample and `edit` otherwise. For the sample, show a `Предпросмотр` tab with `buildContractHtml(title, body, "sample")` in a titled iframe and a `Текст` tab with the current textarea. Put the iframe inside a `h-[68vh] min-h-[320px] w-full` scroll container and scale a fixed 210 × 297 mm canvas to the measured container width so the preview preserves print wrapping. For custom templates, keep the textarea as the only view. Update the iframe whenever `body` changes, focus the selected Preview tab when the dialog opens, focus the textarea when the `Текст` tab opens, and call `generateContractPdf(title, body, formattedSample ? "sample" : "plain")` from the print button.

```tsx
{formattedSample && (
  <div role="tablist" aria-label="Договор">
    <button type="button" role="tab" aria-selected={view === "preview"} onClick={() => setView("preview")}>
      Предпросмотр
    </button>
    <button type="button" role="tab" aria-selected={view === "edit"} onClick={() => setView("edit")}>
      Текст
    </button>
  </div>
)}
{formattedSample && view === "preview" ? (
  <div ref={previewContainerRef} className="h-[68vh] min-h-[320px] w-full overflow-auto rounded-lg border bg-[#eef1ef]">
    <div style={{ width: pageWidth * previewScale, height: pageHeight * previewScale }}>
      <iframe ref={previewRef} title="Предпросмотр договора" srcDoc={buildContractHtml(title, body, "sample")} style={{ width: "210mm", height: "297mm", transform: `scale(${previewScale})`, transformOrigin: "top left" }} />
    </div>
  </div>
) : (
  <textarea id="contract-body" ref={textareaRef} value={body} onChange={(e) => setBody(e.target.value)} />
)}
```

Keep the current Escape handling, dialog labels, and close/print actions. Style the preview iframe within the existing scrollable modal and retain the phone-sized bottom-sheet behavior.

### Task 3: Validate the contract paths

**Files:**
- No additional files.

- [x] **Step 1: Build the app**

Run from `rassrochki/`:

```powershell
npm run build
```

Expected: the Next.js production build exits with code `0`.

- [x] **Step 2: Check sample and custom-template behavior**

In the contract preview, confirm the sample has a centered heading, seller and buyer columns, a payment table with date/amount/signature columns, and signature lines. Confirm payment rows contain no live status labels. Open a loan whose organization has a non-empty saved template and confirm it still opens the plain-text editor and uses the existing print layout. Check both hidden-iframe printing and the in-page fallback use the same content mode.
