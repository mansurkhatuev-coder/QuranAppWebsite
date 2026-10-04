const PAGE_BREAK_SAFETY_PX = 1;
const MAX_TEXT_FRAGMENT_LENGTH = 120;
const MAX_TABLE_CELL_FRAGMENT_LENGTH = 64;
const CONTRACT_PAGE_WIDTH_MM = 210;
const CONTRACT_PAGE_HEIGHT_MM = 297;
const CONTRACT_HORIZONTAL_MARGIN_MM = 20;
const CONTRACT_VERTICAL_MARGIN_MM = 15;

export function getContractPrintablePageHeightPx(
  pageHeightMm = CONTRACT_PAGE_HEIGHT_MM
) {
  const printableHeightMm = pageHeightMm - CONTRACT_VERTICAL_MARGIN_MM * 2;
  return printableHeightMm * (96 / 25.4);
}

function getPageGap(top: number, height: number, pageHeight: number, label: string) {
  if (height > pageHeight - PAGE_BREAK_SAFETY_PX * 2) {
    throw new Error(`${label} is too tall to fit on one contract page.`);
  }

  const remainder = top % pageHeight;
  const offset =
    remainder < PAGE_BREAK_SAFETY_PX ||
    pageHeight - remainder < PAGE_BREAK_SAFETY_PX
      ? 0
      : remainder;

  return offset + height <= pageHeight - PAGE_BREAK_SAFETY_PX
    ? 0
    : pageHeight - offset + PAGE_BREAK_SAFETY_PX;
}

function insertBlockSpacerBefore(
  documentClone: HTMLDocument,
  block: HTMLElement,
  height: number
) {
  const parent = block.parentElement;
  if (!parent) throw new Error("Unable to paginate contract content.");

  const spacer = documentClone.createElement("div");
  spacer.setAttribute("aria-hidden", "true");
  spacer.style.display = "block";
  spacer.style.clear = "both";
  spacer.style.width = "100%";
  spacer.style.height = `${height}px`;
  spacer.style.margin = "0";
  spacer.style.padding = "0";
  spacer.style.border = "0";
  parent.insertBefore(spacer, block);
}

function insertTableRowSpacerBefore(
  documentClone: HTMLDocument,
  row: HTMLTableRowElement,
  height: number
) {
  const parent = row.parentElement;
  if (!parent) throw new Error("Unable to paginate contract table.");

  const spacerRow = documentClone.createElement("tr");
  spacerRow.setAttribute("aria-hidden", "true");
  spacerRow.style.height = `${height}px`;
  const cell = documentClone.createElement("td");
  cell.colSpan = Math.max(row.cells.length, 1);
  cell.style.height = `${height}px`;
  cell.style.padding = "0";
  cell.style.border = "0";
  cell.style.fontSize = "0";
  cell.style.lineHeight = "0";
  spacerRow.appendChild(cell);
  parent.insertBefore(spacerRow, row);
}

function splitTextIntoFragments(
  text: string,
  maxLength = MAX_TEXT_FRAGMENT_LENGTH
) {
  const characters = Array.from(text);
  if (characters.length <= maxLength) return [text];

  const fragments: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let end = Math.min(start + maxLength, characters.length);
    if (end < characters.length) {
      for (let index = end - 1; index > start; index -= 1) {
        if (/\s/u.test(characters[index])) {
          end = index + 1;
          break;
        }
      }
    }
    fragments.push(characters.slice(start, end).join(""));
    start = end;
  }
  return fragments;
}

function collectCellText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType === 1 && (node as HTMLElement).tagName === "BR") return "\n";
  return Array.from(node.childNodes, collectCellText).join("");
}

function setCellTextWithLineBreaks(cell: HTMLTableCellElement, text: string) {
  const documentClone = cell.ownerDocument;
  const lines = text.split(/\r\n|\r|\n/);
  cell.replaceChildren();
  lines.forEach((line, index) => {
    if (index > 0) cell.appendChild(documentClone.createElement("br"));
    cell.appendChild(documentClone.createTextNode(line));
  });
}

function splitTableRow(row: HTMLTableRowElement, maxCellLength: number) {
  const cellFragments = Array.from(row.cells, (cell) =>
    splitTextIntoFragments(collectCellText(cell), maxCellLength)
  );
  const fragmentCount = Math.max(1, ...cellFragments.map((fragments) => fragments.length));

  return Array.from({ length: fragmentCount }, (_, fragmentIndex) => {
    const fragment = row.cloneNode(false) as HTMLTableRowElement;
    Array.from(row.cells).forEach((sourceCell, cellIndex) => {
      const cell = sourceCell.cloneNode(false) as HTMLTableCellElement;
      setCellTextWithLineBreaks(
        cell,
        cellFragments[cellIndex][fragmentIndex] ?? ""
      );
      fragment.appendChild(cell);
    });
    return fragment;
  });
}

function splitOversizedTableRows(sample: HTMLElement, pageHeight: number) {
  const rows = Array.from(sample.querySelectorAll<HTMLTableRowElement>("table tr"));

  for (const row of rows) {
    if (row.getBoundingClientRect().height <= pageHeight - PAGE_BREAK_SAFETY_PX * 2) {
      continue;
    }

    let fragments = splitTableRow(row, MAX_TABLE_CELL_FRAGMENT_LENGTH);
    row.replaceWith(...fragments);

    let maxCellLength = Math.floor(MAX_TABLE_CELL_FRAGMENT_LENGTH / 2);
    while (
      fragments.some(
        (fragment) =>
          fragment.getBoundingClientRect().height >
          pageHeight - PAGE_BREAK_SAFETY_PX * 2
      ) && maxCellLength > 0
    ) {
      fragments = fragments.flatMap((fragment) =>
        fragment.getBoundingClientRect().height >
        pageHeight - PAGE_BREAK_SAFETY_PX * 2
          ? splitTableRow(fragment, maxCellLength)
          : [fragment]
      );
      const currentLength = maxCellLength;
      maxCellLength = Math.floor(maxCellLength / 2);
      if (maxCellLength === currentLength) break;
    }
  }
}

function splitLongSampleBlocks(sample: HTMLElement) {
  const textBlocks = Array.from(
    sample.querySelectorAll<HTMLElement>("p, h1, h2")
  );
  for (const block of textBlocks) {
    if (
      block.classList.contains("badge") ||
      block.classList.contains("payment-schedule-heading") ||
      block.classList.contains("signature-heading")
    ) {
      continue;
    }

    const fragments = splitTextIntoFragments(block.textContent ?? "");
    if (fragments.length <= 1) continue;

    const replacements = fragments.map((fragmentText, index) => {
      const fragment = block.cloneNode(false) as HTMLElement;
      fragment.textContent = fragmentText;
      if (index > 0) fragment.style.marginTop = "0";
      if (index < fragments.length - 1) fragment.style.marginBottom = "0";
      return fragment;
    });
    block.replaceWith(...replacements);
  }
}

function preparePdfFlowBlocks(contract: HTMLElement, pageHeight: number) {
  const sample = contract.querySelector<HTMLElement>(".sample");
  if (sample) {
    splitLongSampleBlocks(sample);
    splitOversizedTableRows(sample, pageHeight);
    for (const block of Array.from(
      sample.querySelectorAll<HTMLElement>("p, h1, h2")
    )) {
      if (
        block.classList.contains("payment-schedule-heading") ||
        block.classList.contains("signature-heading")
      ) {
        continue;
      }
      block.classList.add("contract-pdf-flow-block");
      if (block.tagName === "H1" || block.tagName === "H2") {
        block.classList.add("contract-pdf-flow-heading");
      }
    }
    return;
  }

  const title = contract.querySelector<HTMLElement>(":scope > h1");
  title?.classList.add("contract-pdf-flow-block", "contract-pdf-flow-heading");

  const plainBody = contract.querySelector<HTMLElement>(".contract-plain-body");
  if (!plainBody) return;

  // Split only the already-escaped DOM text; never parse custom-template text as markup.
  const text = plainBody.textContent ?? "";
  const lines = text.length === 0 ? [] : text.split(/\r\n|\r|\n/);
  plainBody.replaceChildren();
  plainBody.style.whiteSpace = "normal";

  for (const line of lines) {
    for (const fragmentText of splitTextIntoFragments(line)) {
      const block = plainBody.ownerDocument.createElement("div");
      block.className = "contract-pdf-flow-block contract-pdf-text-line";
      block.textContent = fragmentText;
      block.style.whiteSpace = "pre-wrap";
      block.style.overflowWrap = "anywhere";
      block.style.minHeight = "1.45em";
      plainBody.appendChild(block);
    }
  }
}

type ContractPaginationTarget = {
  kind: "block" | "table-row";
  start: HTMLElement;
  end: HTMLElement;
  label: string;
};

function createFlowPaginationTargets(
  contract: HTMLElement,
  pageHeight: number
): ContractPaginationTarget[] {
  const blocks = Array.from(
    contract.querySelectorAll<HTMLElement>(".contract-pdf-flow-block")
  );
  const consumed = new Set<HTMLElement>();
  const targets: ContractPaginationTarget[] = [];

  for (const block of blocks) {
    if (consumed.has(block)) continue;

    let followingBlock: HTMLElement | null = null;
    if (block.classList.contains("contract-pdf-flow-heading")) {
      const nextElement = block.nextElementSibling as HTMLElement | null;
      if (nextElement?.classList.contains("contract-plain-body")) {
        const firstLine = nextElement.firstElementChild as HTMLElement | null;
        if (firstLine?.classList.contains("contract-pdf-flow-block")) {
          followingBlock = firstLine;
        }
      } else if (
        nextElement?.classList.contains("contract-pdf-flow-block") &&
        (nextElement.tagName === "P" ||
          nextElement.classList.contains("contract-pdf-text-line"))
      ) {
        followingBlock = nextElement;
      } else if (
        nextElement?.tagName === "TABLE" &&
        !nextElement.classList.contains("payment-schedule") &&
        !nextElement.classList.contains("signature-block")
      ) {
        const table = nextElement as HTMLTableElement;
        const tableBodyRows = Array.from(table.tBodies).flatMap((body) =>
          Array.from(body.rows)
        );
        const tableHeaderRows = Array.from(table.tHead?.rows ?? []);
        followingBlock =
          tableBodyRows[0] ??
          tableHeaderRows[tableHeaderRows.length - 1] ??
          table;
      }
    }

    if (followingBlock) {
      const groupHeight =
        followingBlock.getBoundingClientRect().bottom -
        block.getBoundingClientRect().top;
      if (groupHeight <= pageHeight - PAGE_BREAK_SAFETY_PX * 2) {
        consumed.add(followingBlock);
        targets.push({
          kind: "block",
          start: block,
          end: followingBlock,
          label: "A contract heading and its following block",
        });
        continue;
      }
    }

    targets.push({
      kind: "block",
      start: block,
      end: block,
      label: block.classList.contains("contract-pdf-text-line")
        ? "A contract text line"
        : "A contract paragraph or heading",
    });
  }

  return targets;
}

function isTargetWithinPage(
  start: HTMLElement,
  end: HTMLElement,
  pageHeight: number
) {
  const height = end.getBoundingClientRect().bottom - start.getBoundingClientRect().top;
  return height <= pageHeight - PAGE_BREAK_SAFETY_PX * 2;
}

function addSafeTableOpeningTargets(
  targets: ContractPaginationTarget[],
  table: HTMLTableElement,
  firstRow: HTMLTableRowElement,
  heading: HTMLElement | null,
  pageHeight: number,
  label: string
) {
  if (targets.some((target) => target.start === heading && target.end === firstRow)) {
    return;
  }

  const headerRows = Array.from(table.tHead?.rows ?? []);
  const firstBlock = heading ?? headerRows[0] ?? firstRow;
  if (isTargetWithinPage(firstBlock, firstRow, pageHeight)) {
    targets.push({
      kind: "block",
      start: firstBlock,
      end: firstRow,
      label,
    });
    return;
  }

  if (
    heading &&
    !targets.some((target) => target.start === heading && target.end === heading)
  ) {
    targets.push({
      kind: "block",
      start: heading,
      end: heading,
      label: "A contract table heading",
    });
  }

  if (headerRows.length > 0 && headerRows[0] !== firstRow) {
    const headerStart = headerRows[0];
    if (isTargetWithinPage(headerStart, firstRow, pageHeight)) {
      targets.push({
        kind: "block",
        start: headerStart,
        end: firstRow,
        label: "A contract table header and first row",
      });
      return;
    }

    for (const row of headerRows) {
      targets.push({
        kind: "table-row",
        start: row,
        end: row,
        label: "A contract table header row",
      });
    }
    targets.push({
      kind: "table-row",
      start: firstRow,
      end: firstRow,
      label: "A contract table row",
    });
    return;
  }

  targets.push({
    kind: "table-row",
    start: firstRow,
    end: firstRow,
    label: "A contract table row",
  });
}

function addOtherSampleTableTargets(
  sample: HTMLElement,
  targets: ContractPaginationTarget[],
  pageHeight: number
) {
  const tables = Array.from(
    sample.querySelectorAll<HTMLTableElement>(
      "table:not(.payment-schedule):not(.signature-block)"
    )
  );

  for (const table of tables) {
    const heading = table.previousElementSibling as HTMLElement | null;
    const bodyRows = Array.from(table.tBodies).flatMap((body) =>
      Array.from(body.rows)
    );
    const headerRows = Array.from(table.tHead?.rows ?? []);
    const firstRow = bodyRows[0] ?? headerRows[headerRows.length - 1];
    if (!firstRow) continue;

    const headingCanJoin =
      heading?.classList.contains("contract-pdf-flow-heading") ?? false;
    addSafeTableOpeningTargets(
      targets,
      table,
      firstRow,
      headingCanJoin ? heading : null,
      pageHeight,
      headingCanJoin
        ? "A contract heading and its first table row"
        : "A contract table header and first row"
    );

    for (const row of bodyRows.slice(1)) {
      targets.push({
        kind: "table-row",
        start: row,
        end: row,
        label: "A contract table row",
      });
    }
  }
}

function paginateTarget(
  documentClone: HTMLDocument,
  contractTop: number,
  pageHeight: number,
  target: ContractPaginationTarget
) {
  // Re-measure after insertion to account for adjoining CSS margins around headings.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const top = target.start.getBoundingClientRect().top - contractTop;
    const bottom = target.end.getBoundingClientRect().bottom - contractTop;
    const gap = getPageGap(top, bottom - top, pageHeight, target.label);
    if (gap === 0) return;

    if (target.kind === "table-row") {
      insertTableRowSpacerBefore(
        documentClone,
        target.start as HTMLTableRowElement,
        gap
      );
    } else {
      insertBlockSpacerBefore(documentClone, target.start, gap);
    }
  }

  const top = target.start.getBoundingClientRect().top - contractTop;
  const bottom = target.end.getBoundingClientRect().bottom - contractTop;
  if (getPageGap(top, bottom - top, pageHeight, target.label) > 0) {
    throw new Error("Unable to place contract content on a page.");
  }
}

function compareDocumentOrder(left: HTMLElement, right: HTMLElement) {
  if (left === right) return 0;
  return left.compareDocumentPosition(right) & 4 ? -1 : 1;
}

export function prepareContractPagination(
  documentClone: HTMLDocument,
  pageHeight: number
) {
  const contract = documentClone.querySelector<HTMLElement>(".contract-document");
  if (!contract) throw new Error("Unable to prepare contract layout.");

  contract.style.display = "flow-root";
  contract.style.minHeight = "0";
  contract.style.paddingTop = "0";
  contract.style.paddingBottom = "0";
  preparePdfFlowBlocks(contract, pageHeight);

  const targets = createFlowPaginationTargets(contract, pageHeight);
  const sample = contract.querySelector<HTMLElement>(".sample");
  if (sample) addOtherSampleTableTargets(sample, targets, pageHeight);

  const paymentTable = contract.querySelector<HTMLTableElement>(".payment-schedule");
  if (paymentTable) {
    const heading = paymentTable.previousElementSibling;
    const firstBlock = heading?.classList.contains("payment-schedule-heading")
      ? (heading as HTMLElement)
      : paymentTable;
    const headerRows = Array.from(paymentTable.tHead?.rows ?? []);
    const bodyRows = Array.from(paymentTable.tBodies).flatMap((body) =>
      Array.from(body.rows)
    );
    const firstRow = bodyRows[0] ?? headerRows[headerRows.length - 1];

    if (firstRow) {
      addSafeTableOpeningTargets(
        targets,
        paymentTable,
        firstRow,
        firstBlock === paymentTable ? null : firstBlock,
        pageHeight,
        "The payment schedule heading and first row"
      );
      for (const row of bodyRows.slice(1)) {
        targets.push({
          kind: "table-row",
          start: row,
          end: row,
          label: "A payment schedule row",
        });
      }
    }
  }

  const signatureTable = contract.querySelector<HTMLTableElement>(".signature-block");
  if (signatureTable) {
    const heading = signatureTable.previousElementSibling;
    const firstBlock = heading?.classList.contains("signature-heading")
      ? (heading as HTMLElement)
      : signatureTable;
    const bodyRows = Array.from(signatureTable.tBodies).flatMap((body) =>
      Array.from(body.rows)
    );
    const allRows = Array.from(signatureTable.rows);
    const firstRow = bodyRows[0] ?? allRows[0];
    const signatureHeight =
      signatureTable.getBoundingClientRect().bottom -
      firstBlock.getBoundingClientRect().top;

    if (signatureHeight <= pageHeight - PAGE_BREAK_SAFETY_PX * 2) {
      targets.push({
        kind: "block",
        start: firstBlock,
        end: signatureTable,
        label: "The signature block",
      });
    } else if (firstRow) {
      addSafeTableOpeningTargets(
        targets,
        signatureTable,
        firstRow,
        firstBlock === signatureTable ? null : firstBlock,
        pageHeight,
        "The signature heading and first table row"
      );
      const remainingRows = bodyRows.length ? bodyRows.slice(1) : allRows.slice(1);
      for (const row of remainingRows) {
        targets.push({
          kind: "table-row",
          start: row,
          end: row,
          label: "A signature table row",
        });
      }
    }
  }

  targets.sort((left, right) => compareDocumentOrder(left.start, right.start));
  const contractTop = contract.getBoundingClientRect().top;
  for (const target of targets) {
    paginateTarget(documentClone, contractTop, pageHeight, target);
  }
}

export function getContractPrintableWidthMm() {
  return CONTRACT_PAGE_WIDTH_MM - CONTRACT_HORIZONTAL_MARGIN_MM * 2;
}
