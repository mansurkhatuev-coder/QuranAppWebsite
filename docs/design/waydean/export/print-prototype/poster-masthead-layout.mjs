function approximateTextWidth(text, fontSize, glyphFactor, letterSpacingEm = 0) {
  const characters = Array.from(String(text ?? "")).length;
  if (!characters) return 0;
  return characters * fontSize * (glyphFactor + letterSpacingEm);
}

export function getPosterMastheadLayout(layout, { title, subtitle }) {
  const boardWidthMm = layout.pageWidthMm * layout.pageCountX;
  const marginMm = 12;
  const maxTextWidthMm = layout.pageWidthMm - marginMm * 2;
  const titleBaseSize = Math.max(5.5, Math.min(20, boardWidthMm * 0.012));
  const eyebrowBaseSize = Math.max(1.8, Math.min(4.2, titleBaseSize * 0.22));
  const subtitleBaseSize = Math.max(2.2, Math.min(4.8, titleBaseSize * 0.2));
  const titleCharacters = Array.from(String(title ?? "")).length;
  const eyebrowText = "WAYDEAN · СЕМЕЙНОЕ ДРЕВО";
  const titleSize = titleCharacters
    ? Math.min(titleBaseSize, maxTextWidthMm / (titleCharacters * 0.68))
    : titleBaseSize;
  const eyebrowSize = Math.min(
    eyebrowBaseSize,
    maxTextWidthMm / (Array.from(eyebrowText).length * (0.62 + 0.22))
  );
  const subtitleSize = Math.min(
    subtitleBaseSize,
    maxTextWidthMm / (Array.from(String(subtitle ?? "")).length * (0.68 + 0.14) || 1)
  );
  const dividerHalfWidthMm = Math.min(80, boardWidthMm * 0.07, maxTextWidthMm / 2);
  const halfWidthMm = Math.max(
    dividerHalfWidthMm,
    approximateTextWidth(title, titleSize, 0.68) / 2,
    approximateTextWidth(eyebrowText, eyebrowSize, 0.62, 0.22) / 2,
    approximateTextWidth(subtitle, subtitleSize, 0.68, 0.14) / 2
  );
  const idealCenterX = boardWidthMm / 2;
  let centerX = idealCenterX;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let pageX = 0; pageX < layout.pageCountX; pageX += 1) {
    const minCenterX = pageX * layout.pageWidthMm + marginMm + halfWidthMm;
    const maxCenterX = (pageX + 1) * layout.pageWidthMm - marginMm - halfWidthMm;
    const candidate = Math.max(minCenterX, Math.min(maxCenterX, idealCenterX));
    const distance = Math.abs(candidate - idealCenterX);
    if (distance < bestDistance || (distance === bestDistance && candidate < centerX)) {
      centerX = candidate;
      bestDistance = distance;
    }
  }

  return {
    boardWidthMm,
    centerX,
    titleSize,
    eyebrowSize,
    subtitleSize,
    dividerHalfWidthMm,
    halfWidthMm,
    marginMm
  };
}
