import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PassportNameScan } from "@/components/PassportNameScan";

describe("passport photo selection", () => {
  it("offers separate camera and existing-photo inputs", () => {
    const markup = renderToStaticMarkup(createElement(PassportNameScan, { onUseName: () => undefined }));

    expect(markup).toContain("Сделать фото");
    expect(markup).toContain("Выбрать фото из галереи");
    expect(markup).toContain('accept="image/*" capture="environment"');
    expect(markup).toContain('accept="image/*"');
  });
});
