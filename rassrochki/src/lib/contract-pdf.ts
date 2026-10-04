import { buildContractHtml, type ContractRenderMode } from "@/lib/contract";
import {
  getContractPrintablePageHeightPx,
  prepareContractPagination,
} from "@/lib/contract-layout";

const RESERVED_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g;
const PDF_EXTENSION = /(?:\.pdf)+$/i;
const PDF_PAGE_WIDTH_MM = 210;
const PDF_VERTICAL_MARGIN_MM = 15;
const PDF_WINDOW_WIDTH_PX = 794;

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
      pageCanvas.toDataURL("image/jpeg", 0.96),
      "JPEG",
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
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const printablePageHeightMm = pageHeightMm - PDF_VERTICAL_MARGIN_MM * 2;
  const printablePageHeightPx = getContractPrintablePageHeightPx(pageHeightMm);
  const { frame, frameDocument } = await loadContractFrame(
    buildContractHtml(title, body, mode)
  );

  try {
    const contract = frameDocument.querySelector<HTMLElement>(".contract-document");
    if (!contract) throw new Error("Unable to find contract content for PDF.");

    prepareContractPagination(frameDocument, printablePageHeightPx);
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
