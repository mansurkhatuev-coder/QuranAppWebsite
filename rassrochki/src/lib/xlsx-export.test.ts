import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createXlsxFile } from "@/lib/xlsx-export";

describe("createXlsxFile", () => {
  it("creates a readable multi-sheet Excel workbook", async () => {
    const file = createXlsxFile("debtors.xlsx", [
      { name: "Должники", rows: [["Имя", "Долг"], ["Иван", 1200]] },
      { name: "Оплаты", rows: [["Дата", "Сумма"], ["15.11.2026", 300]] },
    ]);
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));

    expect(file.name).toBe("debtors.xlsx");
    expect(file.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(strFromU8(entries["xl/workbook.xml"])).toContain("Должники");
    expect(strFromU8(entries["xl/workbook.xml"])).toContain("Оплаты");
    expect(strFromU8(entries["xl/worksheets/sheet1.xml"])).toContain("Иван");
    expect(strFromU8(entries["xl/worksheets/sheet2.xml"])).toContain("15.11.2026");
  });
});
