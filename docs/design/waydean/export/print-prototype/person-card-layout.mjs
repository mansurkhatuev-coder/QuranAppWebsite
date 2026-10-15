const REFERENCE_WIDTH = 48;
const REFERENCE_HEIGHT = 34;

export function getPersonCardLayout({
  x = 0,
  y = 0,
  width = REFERENCE_WIDTH,
  height = REFERENCE_HEIGHT,
  nameLines = 1,
  hasDates = false,
  hasTeip = false
} = {}) {
  const scale = Math.max(.66, Math.min(1, width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT));
  const twoLines = nameLines > 1;
  const textX = x + 18 * scale;
  return {
    scale,
    generationX: textX,
    generationY: y + 7 * scale,
    ruleY: y + 9.5 * scale,
    portraitX: x + 8 * scale,
    portraitY: y + height / 2,
    portraitRadius: 5.05 * scale,
    portraitRingRadius: 5.85 * scale,
    nameX: textX,
    nameY: y + (twoLines ? 15.2 : 18) * scale,
    nameSecondY: y + (twoLines ? 18.7 : 21.5) * scale,
    nameAnchor: "start",
    nameLineGap: 3.5 * scale,
    dateY: y + (twoLines ? 24.7 : 23.7) * scale,
    teipY: y + (twoLines ? 29.25 : hasDates ? 28.3 : 27.1) * scale,
    textInset: 18 * scale,
    textLimit: width - 25.5 * scale
  };
}

export function wrapPersonName(value, maxCharacters) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  const flush = () => {
    if (current) lines.push(current);
    current = "";
  };

  for (const word of words) {
    const parts = word.split(/(?<=-)/u);
    if (parts.length > 1 && parts.every(part => part.length <= maxCharacters)) {
      for (const part of parts) {
        if (current && (current + part).length > maxCharacters) flush();
        current += part;
      }
      continue;
    }

    if (word.length > maxCharacters) {
      if (word.length <= maxCharacters + 1) {
        flush();
        current = word;
        continue;
      }
      flush();
      for (let offset = 0; offset < word.length; offset += maxCharacters) lines.push(word.slice(offset, offset + maxCharacters));
      continue;
    }

    if (!current) current = word;
    else if ((current + " " + word).length <= maxCharacters) current += " " + word;
    else { flush(); current = word; }
  }

  flush();
  return lines.length ? lines : [""];
}

export function getConnectorPath(startX, startY, endX, endY) {
  const bendY = (startY + endY) / 2;
  return `M ${startX} ${startY} V ${bendY} H ${endX} V ${endY}`;
}

export function getNameTextLength(measuredWidth, availableWidth) {
  if (!Number.isFinite(measuredWidth) || !Number.isFinite(availableWidth) || availableWidth <= 0) return null;
  return measuredWidth > availableWidth ? availableWidth : null;
}
