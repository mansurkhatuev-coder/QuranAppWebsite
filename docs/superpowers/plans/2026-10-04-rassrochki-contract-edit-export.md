# Installment Contract Editing and PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit a contract for the current installment, download that draft as a multi-page A4 PDF, or print it through the system print dialog.

**Architecture:** Keep the current contract body as the single editable draft in `ContractEditorModal`. Add a client-side PDF exporter that consumes the shared HTML renderer and a separate UI action for printing; neither action writes the draft to organization settings or the database. Preserve the sample's formatted renderer and custom contracts' escaped plain-text renderer.

**Tech Stack:** Next.js 16, React 19, TypeScript, existing `jspdf` HTML plug-in, existing contract HTML renderer, browser print API.

---

## Files and responsibilities

- Modify `rassrochki/src/components/ContractEditorModal.tsx`: make the editing mode obvious, add PDF export progress/error state, and keep print as a separate action.
- Modify `rassrochki/src/lib/contract.ts`: ensure shared HTML styles define a stable A4 document for preview/print and preserve safe rendering for both modes.
- Create `rassrochki/src/lib/contract-pdf.ts`: convert the rendered contract HTML to a downloadable PDF, sanitize the filename, and surface export errors to the caller.
- The accepted behavior and boundaries are in `docs/superpowers/specs/2026-10-04-rassrochki-contract-edit-export-design.md`.

### Task 1: Add a direct PDF download path

**Files:**
- Create: `rassrochki/src/lib/contract-pdf.ts`
- Modify: `rassrochki/src/lib/contract.ts`

- [ ] **Step 1: Expose an async PDF exporter with the agreed interface**

Create `downloadContractPdf(title: string, body: string, mode: ContractRenderMode): Promise<void>`. Import `buildContractHtml` and `ContractRenderMode` from `@/lib/contract`. Dynamically import `jsPDF` inside the function so normal page loads do not pay the PDF bundle cost. Construct an A4 portrait PDF in millimeters and render the exact HTML returned by `buildContractHtml`:

```ts
const { jsPDF } = await import("jspdf");
const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
await pdf.html(buildContractHtml(title, body, mode), {
  x: 0,
  y: 0,
  width: 210,
  windowWidth: 794,
  autoPaging: "text",
  html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
});
pdf.save(makeContractPdfFilename(title));
```

Keep generation inside one `try`/`catch` boundary only if the helper adds context to the thrown error; otherwise let the caller display the error. Do not fetch contract data or fonts from a remote service.

- [ ] **Step 2: Sanitize the suggested filename**

Add a local helper in `contract-pdf.ts` that replaces Windows/POSIX reserved filename characters and control characters with `_`, trims trailing periods/spaces, falls back to `Договор`, and appends `.pdf` exactly once. The resulting file for `Договор_Иван Петров` is `Договор_Иван Петров.pdf`.

- [ ] **Step 3: Align the shared HTML page rules**

In `buildContractHtml`, keep the current sample content and plain-text escaping. Give both modes an A4 page size and stable printable content width; the sample keeps its centered hierarchy and tables, while plain mode keeps its title and line breaks. Keep print margins in `@page` so they repeat on later pages. Add `break-inside: avoid` / `page-break-inside: avoid` to payment table rows and signature blocks. Do not parse custom-template input as HTML.

### Task 2: Make edit, export, and print actions explicit

**Files:**
- Modify: `rassrochki/src/components/ContractEditorModal.tsx`

- [ ] **Step 1: Label the editable mode clearly**

Change the sample tab label from `Текст` to `Редактировать`; preserve the custom-template text editor. Keep edits in the existing `body` state and continue passing that exact state to preview and both output actions.

- [ ] **Step 2: Add controlled PDF export state**

Add `isExportingPdf: boolean` and `exportError: string | null`. Add a handler that refuses empty text or a second concurrent export, sets progress before awaiting `downloadContractPdf(title, body, mode)`, reports `Не удалось скачать PDF. Попробуйте ещё раз или используйте печать.` on failure, and always clears progress in `finally`.

```ts
if (!body.trim() || isExportingPdf) return;
setIsExportingPdf(true);
setExportError(null);
try {
  await downloadContractPdf(title, body, formattedSample ? "sample" : "plain");
} catch {
  setExportError("Не удалось скачать PDF. Попробуйте ещё раз или используйте печать.");
} finally {
  setIsExportingPdf(false);
}
```

- [ ] **Step 3: Render separate output controls**

Add `Скачать PDF` and `Печать` buttons. Both are disabled when `body.trim()` is empty; PDF is also disabled while exporting and changes its label to `Подготовка PDF…`. Keep the print button wired to `generateContractPdf(title, body, mode)`. Show `exportError` next to the buttons with `role="alert"`. Export failure must leave the current draft and editor open.

### Task 3: Verify exported and printed contracts

**Files:**
- No production files beyond Tasks 1–2.

- [ ] **Step 1: Build the app**

Run from `rassrochki/`:

```powershell
npm run build
```

Expected: Next.js production build and TypeScript checks complete successfully.

- [ ] **Step 2: Inspect a sample contract PDF**

Open a sample contract with a 36-row schedule, edit one product/name/term value, download the PDF, and inspect its page count, Cyrillic text, A4 width, margins, tables, signatures, and final schedule row. Confirm the edit appears in the PDF and that no table row or signature line is clipped.

- [ ] **Step 3: Inspect print and custom-template paths**

Print the same edited sample and cancel the browser dialog; confirm the editor remains available. Repeat PDF download and print with a saved custom plain-text template. Confirm its variables remain expanded, tags are escaped as text, and closing without export leaves organization settings unchanged.

Do not add or run an automated test suite for this task; the requested verification is the production build plus the manual PDF/print inspection above.
