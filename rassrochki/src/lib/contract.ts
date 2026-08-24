"use client";

import { jsPDF } from "jspdf";

export function generateContractPdf(title: string, body: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const lines = doc.splitTextToSize(body, 180);
  doc.setFontSize(12);
  doc.text(title, 15, 20);
  doc.setFontSize(10);
  doc.text(lines, 15, 30);
  doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
}

export function fillContractTemplate(
  template: string,
  vars: Record<string, string>
) {
  return Object.entries(vars).reduce(
    (text, [key, val]) => text.replaceAll(`{${key}}`, val),
    template
  );
}
