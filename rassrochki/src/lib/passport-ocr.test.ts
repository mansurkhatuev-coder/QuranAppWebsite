import { describe, expect, it } from "vitest";
import { extractPassportFullName } from "@/lib/passport-ocr";

describe("extractPassportFullName", () => {
  it("extracts surname, given name, and patronymic from labelled passport lines", () => {
    const result = extractPassportFullName(`
      РОССИЙСКАЯ ФЕДЕРАЦИЯ
      ФАМИЛИЯ
      ХАЛИМОВ
      ИМЯ
      ЯКУБ
      ОТЧЕСТВО
      МУСТАФАЕВИЧ
      ДАТА РОЖДЕНИЯ
      01.01.1990
    `);

    expect(result).toBe("Халимов Якуб Мустафаевич");
  });

  it("accepts values that OCR placed on the same line as labels", () => {
    expect(
      extractPassportFullName("ФАМИЛИЯ: ИВАНОВ\nИМЯ: ПЁТР\nОТЧЕСТВО: ИВАНОВИЧ")
    ).toBe("Иванов Пётр Иванович");
  });

  it("returns null instead of guessing when name labels are missing", () => {
    expect(extractPassportFullName("РОССИЙСКАЯ ФЕДЕРАЦИЯ\nПАСПОРТ\n01.01.1990")).toBeNull();
  });

  it("does not treat the next passport field as a missing patronymic", () => {
    expect(
      extractPassportFullName("ФАМИЛИЯ\nИВАНОВ\nИМЯ\nИВАН\nОТЧЕСТВО\nДАТА РОЖДЕНИЯ\n01.01.1990")
    ).toBe("Иванов Иван");
  });
});
