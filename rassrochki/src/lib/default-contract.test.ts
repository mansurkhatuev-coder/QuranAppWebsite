import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as defaultContract from "@/lib/default-contract";

const legacyDatabaseDefault = `ДОГОВОР РАССРОЧКИ

Организация: {organization}
Клиент: {client}
Телефон: {phone}
Сумма: {amount} ₽
Срок: {term_months} мес.
Ежемесячный платёж: {monthly_payment} ₽
Дата начала: {start_date}

График платежей:
{schedule}

Доли дохода: {manager_share}% / {investor_share}%
Инвестор: {investor}

Подпись клиента: _______________
Подпись организации: _______________`;

describe("shouldUseDefaultContractSample", () => {
  it("uses the approved sample for blank templates", () => {
    expect(defaultContract.shouldUseDefaultContractSample?.("")).toBe(true);
    expect(defaultContract.shouldUseDefaultContractSample?.(" \n\t ")).toBe(true);
  });

  it("recognizes the old database default, including Windows line endings", () => {
    expect(defaultContract.shouldUseDefaultContractSample?.(legacyDatabaseDefault)).toBe(true);
    expect(
      defaultContract.shouldUseDefaultContractSample?.(
        legacyDatabaseDefault.replace(/\n/g, "\r\n")
      )
    ).toBe(true);
  });

  it("preserves any edited or custom organization template", () => {
    expect(
      defaultContract.shouldUseDefaultContractSample?.(
        `${legacyDatabaseDefault}\nДополнительное условие: согласовано.`
      )
    ).toBe(false);
    expect(defaultContract.shouldUseDefaultContractSample?.(`${legacyDatabaseDefault}\n`)).toBe(
      false
    );
    expect(defaultContract.shouldUseDefaultContractSample?.("Мой шаблон договора")).toBe(false);
  });

  it("migrates only the exact legacy database default", () => {
    const migration = readFileSync(
      new URL("../../supabase/migrations/015_default_contract_template.sql", import.meta.url),
      "utf8"
    );
    const migrationTemplate = migration.match(/\) = \$legacy\$([\s\S]*?)\$legacy\$/)?.[1];

    expect(migrationTemplate?.replace(/\r\n?/g, "\n")).toBe(legacyDatabaseDefault);
  });
});
