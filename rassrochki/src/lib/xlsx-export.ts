import { zipSync } from "fflate";

export type XlsxSheet = {
  name: string;
  rows: Array<Array<string | number | null | undefined>>;
};

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function safeSheetName(name: string, index: number) {
  const normalized = name.replace(/[\\/?*:[\]]/g, " ").slice(0, 31).trim();
  return normalized || "Лист " + String(index + 1);
}

function sheetXml(sheet: XlsxSheet) {
  const rows = sheet.rows.length > 0 ? sheet.rows : [["Нет данных"]];
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const lastColumn = columnName(columnCount - 1);
  const widths = Array.from({ length: columnCount }, (_, column) => {
    const measured = Math.max(12, ...rows.slice(0, 30).map((row) => String(row[column] ?? "").length + 2));
    return Math.min(42, measured);
  });
  const columns = widths.map((width, index) =>
    '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>'
  ).join("");
  const data = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
      const value = row[columnIndex];
      const reference = columnName(columnIndex) + (rowIndex + 1);
      const style = rowIndex === 0 ? ' s="1"' : "";
      if (typeof value === "number" && Number.isFinite(value)) {
        return '<c r="' + reference + '"' + style + '><v>' + String(value) + "</v></c>";
      }
      const text = xml(value);
      return '<c r="' + reference + '" t="inlineStr"' + style + '><is><t xml:space="preserve">' + text + "</t></is></c>";
    }).join("");
    return '<row r="' + (rowIndex + 1) + '">' + cells + "</row>";
  }).join("");

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/><cols>' + columns + '</cols><sheetData>' + data + '</sheetData>' +
    '<autoFilter ref="A1:' + lastColumn + rows.length + '"/></worksheet>';
}

export function createXlsxFile(filename: string, sheets: XlsxSheet[]) {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: "Данные", rows: [["Нет данных"]] }];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      safeSheets.map((_, index) => '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
      "</Types>"
    ),
    "_rels/.rels": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>"
    ),
    "xl/workbook.xml": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + safeSheets.map((sheet, index) =>
        '<sheet name="' + xml(safeSheetName(sheet.name, index)) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>'
      ).join("") + "</sheets></workbook>"
    ),
    "xl/_rels/workbook.xml.rels": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      safeSheets.map((_, index) => '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>').join("") +
      '<Relationship Id="rId' + (safeSheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>"
    ),
    "xl/styles.xml": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    ),
  };

  safeSheets.forEach((sheet, index) => {
    files["xl/worksheets/sheet" + (index + 1) + ".xml"] = new TextEncoder().encode(sheetXml(sheet));
  });
  const archive = zipSync(files, { level: 6 });
  const bytes = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
  return new File([bytes], filename, { type: MIME });
}
