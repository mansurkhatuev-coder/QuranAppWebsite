const NAME_FIELD_LABELS = ["ФАМИЛИЯ", "ИМЯ", "ОТЧЕСТВО"] as const;
const PASSPORT_FIELD_LABEL_PATTERN =
  /(?<!\p{L})(?:ФАМИЛИЯ|ИМЯ|ОТЧЕСТВО|ПОЛ|ДАТА\s+РОЖДЕНИЯ|МЕСТО\s+РОЖДЕНИЯ|КОД\s+ПОДРАЗДЕЛЕНИЯ|ВЫДАН)(?!\p{L})/iu;

type NameFieldLabel = (typeof NAME_FIELD_LABELS)[number];

function labelPattern(label: NameFieldLabel) {
  return new RegExp(`(?<!\\p{L})${label}(?!\\p{L})`, "giu");
}

function hasPassportFieldLabel(line: string) {
  return PASSPORT_FIELD_LABEL_PATTERN.test(line);
}

function cleanNamePart(value: string): string | null {
  const cleaned = value
    .normalize("NFKC")
    .replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}'’ʼ-]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || !/^\p{L}[\p{L}\p{M}'’ʼ-]*(?:\s+\p{L}[\p{L}\p{M}'’ʼ-]*){0,3}$/u.test(cleaned)) {
    return null;
  }

  return cleaned
    .toLocaleLowerCase("ru-RU")
    .replace(/(^|[\s'’ʼ-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("ru-RU"));
}

function extractField(lines: string[], label: NameFieldLabel): string | null {
  const pattern = labelPattern(label);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    pattern.lastIndex = 0;
    const match = pattern.exec(line);
    if (!match) continue;

    const sameLineValue = line.slice(match.index + match[0].length);
    const nextLabel = NAME_FIELD_LABELS.map((nameLabel) =>
      labelPattern(nameLabel).exec(sameLineValue)
    )
      .filter((candidate): candidate is RegExpExecArray => candidate !== null)
      .sort((left, right) => left.index - right.index)[0];
    const inlineValue = nextLabel
      ? sameLineValue.slice(0, nextLabel.index)
      : sameLineValue;
    const parsedInlineValue = cleanNamePart(inlineValue);
    if (parsedInlineValue) return parsedInlineValue;

    for (let nextLineIndex = lineIndex + 1; nextLineIndex < lines.length; nextLineIndex += 1) {
      const nextLine = lines[nextLineIndex];
      if (hasPassportFieldLabel(nextLine)) break;
      const parsedNextLine = cleanNamePart(nextLine);
      if (parsedNextLine) return parsedNextLine;
    }
  }

  return null;
}

/** Extracts only the labelled full name from OCR text; never persists source text or image data. */
export function extractPassportFullName(ocrText: string): string | null {
  const lines = ocrText
    .normalize("NFKC")
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const surname = extractField(lines, "ФАМИЛИЯ");
  const givenName = extractField(lines, "ИМЯ");
  if (!surname || !givenName) return null;

  const patronymic = extractField(lines, "ОТЧЕСТВО");
  return [surname, givenName, patronymic].filter(Boolean).join(" ");
}
