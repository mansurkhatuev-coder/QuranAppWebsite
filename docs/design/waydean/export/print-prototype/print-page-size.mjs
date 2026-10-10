export function getPrintPageRule(layout) {
  const width = Number(layout?.pageWidthMm);
  const height = Number(layout?.pageHeightMm);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("Print page dimensions must be positive millimetres");
  }
  return `@media print{@page{size:${width}mm ${height}mm;margin:0}}`;
}
