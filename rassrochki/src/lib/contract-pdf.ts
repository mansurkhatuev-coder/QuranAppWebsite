import { buildContractHtml, type ContractRenderMode } from "@/lib/contract";

const RESERVED_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g;
const PDF_EXTENSION = /(?:\.pdf)+$/i;

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

  await pdf.html(buildContractHtml(title, body, mode), {
    x: 0,
    y: 0,
    width: 210,
    windowWidth: 794,
    margin: [15, 0, 15, 0],
    autoPaging: "text",
    html2canvas: {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      onclone: (documentClone) => {
        const contract = documentClone.querySelector<HTMLElement>(".contract-document");
        if (contract) {
          contract.style.paddingTop = "0";
          contract.style.paddingBottom = "0";
        }
      },
    },
  });

  pdf.save(makeContractPdfFilename(title));
}
