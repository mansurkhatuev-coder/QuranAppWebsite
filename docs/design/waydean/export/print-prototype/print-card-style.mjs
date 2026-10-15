export const PRINT_CARD_STYLES = Object.freeze({
  glass: Object.freeze({
    key: "glass",
    fillOpacity: 0.31,
    selectedFillOpacity: 0.48,
    strokeOpacity: 0.56,
    selectedStrokeOpacity: 0.92,
    strokeWidth: 0.42,
    selectedStrokeWidth: 0.62,
    innerOpacity: 0.2,
    highlightOpacity: 0.3,
    haloOpacity: 0
  }),
  frost: Object.freeze({
    key: "frost",
    fillOpacity: 0.48,
    selectedFillOpacity: 0.62,
    strokeOpacity: 0.68,
    selectedStrokeOpacity: 0.94,
    strokeWidth: 0.54,
    selectedStrokeWidth: 0.68,
    innerOpacity: 0.3,
    highlightOpacity: 0.28,
    haloOpacity: 0
  }),
  halo: Object.freeze({
    key: "halo",
    fillOpacity: 0.35,
    selectedFillOpacity: 0.54,
    strokeOpacity: 0.6,
    selectedStrokeOpacity: 0.96,
    strokeWidth: 0.46,
    selectedStrokeWidth: 0.7,
    innerOpacity: 0.16,
    highlightOpacity: 0.34,
    haloOpacity: 0.15
  })
});

export function getPrintCardStyle(key) {
  return PRINT_CARD_STYLES[key] ?? PRINT_CARD_STYLES.glass;
}

export function renderPersonCardFrame({ styleKey, x, y, width, height, theme, selected = false }) {
  const style = getPrintCardStyle(styleKey);
  const fill = selected ? theme.selectedCard : theme.card;
  const fillOpacity = selected ? style.selectedFillOpacity : style.fillOpacity;
  const stroke = selected ? theme.selectedBorder : theme.cardBorder;
  const strokeOpacity = selected ? style.selectedStrokeOpacity : style.strokeOpacity;
  const strokeWidth = selected ? style.selectedStrokeWidth : style.strokeWidth;
  const halo = style.haloOpacity > 0
    ? '<rect class="person-card-halo" x="' + (x - 0.55) + '" y="' + (y - 0.55) + '" width="' + (width + 1.1) + '" height="' + (height + 1.1) + '" rx="3.75" fill="none" stroke="' + (selected ? theme.selectedBorder : theme.cardBorder) + '" stroke-opacity="' + (selected ? style.haloOpacity * 1.65 : style.haloOpacity) + '" stroke-width="1.1"/>'
    : "";

  return halo +
    '<rect class="person-card-frame" x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" rx="3.2" fill="' + fill + '" fill-opacity="' + fillOpacity + '" stroke="' + stroke + '" stroke-opacity="' + strokeOpacity + '" stroke-width="' + strokeWidth + '"/>' +
    '<rect x="' + (x + 0.95) + '" y="' + (y + 0.95) + '" width="' + (width - 1.9) + '" height="' + (height - 1.9) + '" rx="2.45" fill="none" stroke="' + theme.cardInner + '" stroke-opacity="' + style.innerOpacity + '" stroke-width=".22"/>' +
    '<path d="M ' + (x + 3.1) + ' ' + (y + 0.72) + ' H ' + (x + width - 3.1) + '" stroke="#f4f0e3" stroke-opacity="' + style.highlightOpacity + '" stroke-width=".18" stroke-linecap="round"/>' +
    (selected ? '<rect x="' + (x + 0.75) + '" y="' + (y + 0.75) + '" width="' + (width - 1.5) + '" height="' + (height - 1.5) + '" rx="1.45" fill="none" stroke="' + theme.selectedBorder + '" stroke-width=".24"/>' : "");
}
