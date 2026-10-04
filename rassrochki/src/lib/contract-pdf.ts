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
  const contract = documentClone.querySelector<HTMLElement>(".contract-document");
  if (!contract) throw new Error("Unable to prepare contract layout for PDF.");

  contract.style.display = "flow-root";
  contract.style.minHeight = "0";
  contract.style.paddingTop = "0";
  contract.style.paddingBottom = "0";

  const contractTop = contract.getBoundingClientRect().top;
  const paymentTable = contract.querySelector<HTMLTableElement>(".payment-schedule");
  if (paymentTable) {
    const heading = paymentTable.previousElementSibling;
    const firstBlock = heading?.classList.contains("payment-schedule-heading")
      ? (heading as HTMLElement)
      : paymentTable;
    const headerRows = Array.from(paymentTable.tHead?.rows ?? []);
    const bodyRows = Array.from(paymentTable.tBodies).flatMap((body) =>
      Array.from(body.rows)
    );
    const firstRow = bodyRows[0] ?? headerRows[headerRows.length - 1];
    const firstGroupTop = firstBlock ?? headerRows[0] ?? firstRow;

    if (firstRow && firstGroupTop) {
      const top = firstGroupTop.getBoundingClientRect().top - contractTop;
      const bottom = firstRow.getBoundingClientRect().bottom - contractTop;
      const gap = getPageGap(top, bottom - top, pageHeight);
      if (gap > 0) insertBlockSpacerBefore(documentClone, firstBlock, gap);
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

function addCanvasPages(
  pdf: import("jspdf").jsPDF,
  canvas: HTMLCanvasElement,
  pageHeightMm: number
) {
  const pixelsPerMm = canvas.width / PDF_PAGE_WIDTH_MM;
  const pageHeightPixels = Math.round(pageHeightMm * pixelsPerMm);
  const pageCount = Math.max(1, Math.ceil(canvas.height / pageHeightPixels));
  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = canvas.width;
  pageCanvas.height = pageHeightPixels;

  const context = pageCanvas.getContext("2d");
  if (!context) throw new Error("Unable to paginate contract PDF image.");

  for (let page = 0; page < pageCount; page += 1) {
    if (page > 0) pdf.addPage();

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    const sourceY = page * pageHeightPixels;
    const sourceHeight = Math.min(pageHeightPixels, canvas.height - sourceY);
    if (sourceHeight > 0) {
      context.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sourceHeight,
        0,
        0,
        canvas.width,
        sourceHeight
      );
    }

    pdf.addImage(
      pageCanvas,
      "PNG",
      0,
      PDF_VERTICAL_MARGIN_MM,
      PDF_PAGE_WIDTH_MM,
      pageCanvas.height / pixelsPerMm
    );
  }
}

async function loadContractFrame(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${PDF_WINDOW_WIDTH_PX}px;height:1123px;border:0;`;

  const loaded = new Promise<void>((resolve, reject) => {
    frame.addEventListener("load", () => resolve(), { once: true });
    frame.addEventListener(
      "error",
      () => reject(new Error("Unable to load contract HTML.")),
      { once: true }
    );
  });

  frame.srcdoc = html;
  document.body.appendChild(frame);
  try {
    await loaded;
    const frameDocument = frame.contentDocument;
    if (!frameDocument) {
      throw new Error("Unable to read contract HTML for PDF.");
    }

    await frameDocument.fonts.ready;
    return { frame, frameDocument };
  } catch (error) {
    frame.remove();
    throw error;
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
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const printablePageHeightMm =
    pdf.internal.pageSize.getHeight() - PDF_VERTICAL_MARGIN_MM * 2;
  const printablePageHeightPx = getPdfPageHeightInCssPixels(
    pdf.internal.pageSize.getHeight()
  );
  const { frame, frameDocument } = await loadContractFrame(
    buildContractHtml(title, body, mode)
  );

  try {
    const contract = frameDocument.querySelector<HTMLElement>(".contract-document");
    if (!contract) throw new Error("Unable to find contract content for PDF.");

    preparePdfPagination(frameDocument, printablePageHeightPx);
    const canvas = await html2canvas(contract, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: false,
      windowHeight: 1123,
      windowWidth: PDF_WINDOW_WIDTH_PX,
    });

    addCanvasPages(pdf, canvas, printablePageHeightMm);
    pdf.save(makeContractPdfFilename(title));
  } finally {
    frame.remove();
  }
}
