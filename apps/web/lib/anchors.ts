export type Anchor = {
  start: number;
  end: number;
  exact: string;
  prefix: string;
  suffix: string;
};
export function createAnchor(
  text: string,
  start: number,
  end: number,
): Anchor | null {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > text.length ||
    start >= end ||
    !text.slice(start, end).trim()
  )
    return null;
  return {
    start,
    end,
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - 24), start),
    suffix: text.slice(end, end + 24),
  };
}
export function segments(
  text: string,
  base: number,
  ranges: (Anchor & { id: string })[],
  cuts: number[] = [],
) {
  const end = base + text.length;
  const active = ranges.filter((r) => r.end > base && r.start < end);
  const boundaries = [
    ...new Set([
      base,
      end,
      ...cuts.filter((cut) => cut > base && cut < end),
      ...active.flatMap((r) => [Math.max(base, r.start), Math.min(end, r.end)]),
    ]),
  ].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, i) => ({
    text: text.slice(start - base, boundaries[i + 1] - base),
    ids: active
      .filter((r) => r.start < boundaries[i + 1] && r.end > start)
      .map((r) => r.id),
  }));
}
export function anchorFromSelection(
  root: HTMLElement,
  text: string,
  selection: Selection | null,
): Anchor | null {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1)
    return null;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer) ||
    root.textContent !== text
  )
    return null;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  return createAnchor(text, start, start + range.toString().length);
}
