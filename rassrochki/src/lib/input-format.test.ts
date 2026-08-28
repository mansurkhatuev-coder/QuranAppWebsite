import { describe, expect, it } from "vitest";
import { sanitizeDecimalInput, sanitizeIntegerInput, sanitizePersonName } from "@/lib/input-sanitize";
import { formatPhoneRu, phoneDigitsOnly } from "@/lib/phone";

describe("formatPhoneRu", () => {
  it("форматирует полный номер", () => {
    expect(formatPhoneRu("89991234567")).toBe("+7 (999) 123-45-67");
    expect(formatPhoneRu("9991234567")).toBe("+7 (999) 123-45-67");
  });

  it("частичный ввод", () => {
    expect(formatPhoneRu("999")).toBe("+7 (999");
    expect(formatPhoneRu("999123")).toBe("+7 (999) 123");
  });

  it("phoneDigitsOnly ограничивает 11 цифр", () => {
    expect(phoneDigitsOnly("89991234567890123")).toBe("79991234567");
  });
});

describe("input sanitize", () => {
  it("integer — только цифры", () => {
    expect(sanitizeIntegerInput("12мес3")).toBe("123");
  });

  it("decimal — одна точка", () => {
    expect(sanitizeDecimalInput("1 234,56abc")).toBe("1234.56");
    expect(sanitizeDecimalInput("10.5.5")).toBe("10.55");
  });

  it("person name — без цифр", () => {
    expect(sanitizePersonName("Иванов Иван 2")).toBe("Иванов Иван ");
  });
});
