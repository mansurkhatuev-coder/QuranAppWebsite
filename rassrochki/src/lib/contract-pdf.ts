import { buildContractHtml, type ContractRenderMode } from "@/lib/contract";

const RESERVED_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g;
const PDF_EXTENSION = /(?:\.pdf)+$/i;
const PDF_PAGE_WIDTH_MM = 210;
const PDF_VERTICAL_MARGIN_MM = 15;
const PDF_WINDOW_WIDTH_PX = 794;
const PAGE_BREAK_SAFETY_PX = 1;

function getPdfPageHeightInCssPixels(pageHeightMm: number) {
  const printableHeightMm = pageHeightMm - PDF_VERTICAL_MARGIN_MM * 2;
  return printableHeightMm * (PDF_WINDOW_WIDTH_PX / PDF_PAGE_WIDTH_MM);
}

function getPageGap(top: number, height: number, pageHeight: number) {
  if (height > pageHeight - PAGE_BREAK_SAFETY_PX * 2) {
    throw new Error("Contract content is too tall to fit on one PDF page.");
  }

  const remainder = top % pageHeight;
  const offset =
    remainder < PAGE_BREAK_SAFETY_PX ||
    pageHeight - remainder < PAGE_BREAK_SAFETY_PX
      ? 0
      : remainder;

  return offset + height <= pageHeight - PAGE_BREAK_SAFETY_PX
    ? 0
    : pageHeight - offset + PAGE_BREAK_SAFETY_PX;
}

function insertBlockSpacerBefore(
  documentClone: HTMLDocument,
  block: HTMLElement,
  height: number
) {
  const parent = block.parentElement;
  if (!parent) throw new Error("Unable to paginate contract content for PDF.");

  const spacer = documentClone.createElement("div");
  spacer.setAttribute("aria-hidden", "true");
  spacer.style.display = "block";
  spacer.style.clear = "both";
  spacer.style.width = "100%";
  spacer.style.height = `${height}px`;
  spacer.style.margin = "0";
  spacer.style.padding = "0";
  spacer.style.border = "0";
  parent.insertBefore(spacer, block);
}

function insertTableRowSpacerBefore(
  documentClone: HTMLDocument,
  row: HTMLTableRowElement,
  height: number
) {
  const parent = row.parentElement;
  if (!parent) throw new Error("Unable to paginate contract table for PDF.");

  const spacerRow = documentClone.createElement("tr");
  spacerRow.setAttribute("aria-hidden", "true");
  spacerRow.style.height = `${height}px`;
  const cell = documentClone.createElement("td");
  cell.colSpan = Math.max(row.cells.length, 1);
  cell.style.height = `${height}px`;
  cell.style.padding = "0";
  cell.style.border = "0";
  cell.style.fontSize = "0";
  cell.style.lineHeight = "0";
  spacerRow.appendChild(cell);
  parent.insertBefore(spacerRow, row);
}

function preparePdfPagination(documentClone: HTMLDocument, pageHeight: number) {
  // html2canvas does not apply CSS page-break rules, so insert real flow gaps in its clone.
  const contract = documentClone.querySelector<HTMLElement>(
    ".html2pdf__container .contract-document"
  );
  if (!contract) throw new Error("Unable to prepare contract layout for PDF.");

  contract.style.minHeight = "0";
  contract.style.paddingTop = "0";
  contract.style.paddingBottom = "0";

  const contractTop = contract.getBoundingClientRect().top;
  const paymentTable = contract.querySelector<HTMLTableElement>(".payment-schedule");
  if (paymentTable) {
    const headerRows = Array.from(paymentTable.tHead?.rows ?? []);
    const bodyRows = Array.from(paymentTable.tBodies).flatMap((body) =>
      Array.from(body.rows)
    );
    const firstRow = bodyRows[0] ?? headerRows[headerRows.length - 1];
    const firstGroupTop = headerRows[0] ?? firstRow;

    if (firstRow && firstGroupTop) {
      const top = firstGroupTop.getBoundingClientRect().top - contractTop;
      const bottom = firstRow.getBoundingClientRect().bottom - contractTop;
      const gap = getPageGap(top, bottom - top, pageHeight);
      if (gap > 0) insertBlockSpacerBefore(documentClone, paymentTable, gap);
    }

    for (const row of bodyRows) {
      const rect = row.getBoundingClientRect();
      const top = rect.top - contractTop;
      const gap = getPageGap(top, rect.height, pageHeight);
      if (gap > 0) insertTableRowSpacerBefore(documentClone, row, gap);
    }
  }

  const signatureBlock = contract.querySelector<HTMLTableElement>(".signature-block");
  if (signatureBlock) {
    const heading = signatureBlock.previousElementSibling;
    const firstBlock = heading?.classList.contains("signature-heading")
      ? (heading as HTMLElement)
      : signatureBlock;
    const blockTop = firstBlock.getBoundingClientRect().top - contractTop;
    const blockBottom = signatureBlock.getBoundingClientRect().bottom - contractTop;
    const gap = getPageGap(blockTop, blockBottom - blockTop, pageHeight);
    if (gap > 0) insertBlockSpacerBefore(documentClone, firstBlock, gap);
  }
}

function makeContractPdfFilename(title: string) {
  const sanitized = title
    .replace(RESERVED_FILENAME_CHARACTERS, "_")
    .replace(/[. ]+$/g, "")
    .replace(PDF_EXTENSION, "")
    .replace(/[. ]+$/g, "");
  const filename = sanitized || "Договор";

  return `${filename}.pdf`;
}

export async function downloadContractPdf(
  title: string,
  body: string,
  mode: ContractRenderMode
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const printablePageHeight = getPdfPageHeightInCssPixels(
    pdf.internal.pageSize.getHeight()
  );

  await pdf.html(buildContractHtml(title, body, mode), {
    x: 0,
    y: 0,
    width: PDF_PAGE_WIDTH_MM,
    windowWidth: PDF_WINDOW_WIDTH_PX,
    margin: [15, 0, 15, 0],
    autoPaging: "text",
    html2canvas: {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      onclone: (documentClone) => {
        preparePdfPagination(documentClone, printablePageHeight);
      },
    },
  });

  pdf.save(makeContractPdfFilename(title));
}
