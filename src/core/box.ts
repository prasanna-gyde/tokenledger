import chalk from "chalk";

// Matches SGR color codes (all chalk emits). Used to measure *visible* width so
// padding/truncation ignore the invisible bytes a colored string carries.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Visible length of a string, ignoring ANSI color codes. */
export function visibleLen(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

/** Right-pad a (possibly colored) string with spaces to a visible width. */
export function padEndVisible(s: string, width: number): string {
  const pad = width - visibleLen(s);
  return pad > 0 ? s + " ".repeat(pad) : s;
}

/** Left-pad a (possibly colored) string with spaces to a visible width. */
export function padStartVisible(s: string, width: number): string {
  const pad = width - visibleLen(s);
  return pad > 0 ? " ".repeat(pad) + s : s;
}

/**
 * Truncate to a visible width with a trailing ellipsis. Assumes plain text
 * (no ANSI) — only used on raw fields like segment names before coloring.
 */
export function truncVisible(s: string, width: number): string {
  const plain = s.replace(ANSI_RE, "");
  if (plain.length <= width) return plain;
  if (width <= 1) return "…".repeat(Math.max(0, width));
  return plain.slice(0, width - 1) + "…";
}

/** Force a string to exactly `width` visible columns (truncate then pad). */
function fitVisible(s: string, width: number): string {
  if (visibleLen(s) <= width) return padEndVisible(s, width);
  return padEndVisible(truncVisible(s, width), width);
}

/**
 * One row with `left` flush-left and `right` flush-right within `width`. When
 * the two would collide, the left side is truncated to make room.
 */
export function splitCols(left: string, right: string, width: number): string {
  const gap = width - visibleLen(left) - visibleLen(right);
  if (gap >= 1) return left + " ".repeat(gap) + right;
  const avail = Math.max(0, width - visibleLen(right) - 1);
  return padEndVisible(truncVisible(left, avail), width - visibleLen(right)) + right;
}

export interface CardOpts {
  minWidth?: number;
  maxWidth?: number;
  /** Terminal columns; defaults to process.stdout.columns or 80. Injectable for tests. */
  columns?: number;
  /** Horizontal padding inside the border. */
  padX?: number;
}

/**
 * Render a bordered card. `groups` are blocks of content lines; a horizontal
 * divider is drawn between adjacent groups. Lines may contain chalk codes; width
 * is measured visibly so the right border stays aligned. The border is dimmed so
 * content reads first.
 */
export function drawCard(groups: string[][], opts: CardOpts = {}): string {
  const padX = opts.padX ?? 2;
  const minW = opts.minWidth ?? 44;
  const maxW = opts.maxWidth ?? 68;
  const cols = opts.columns ?? process.stdout.columns ?? 80;

  const lines = groups.flat();
  const contentMax = lines.reduce((m, l) => Math.max(m, visibleLen(l)), 0);
  const ceiling = Math.min(maxW, Math.max(minW, cols - 2));
  const inner = Math.min(Math.max(contentMax + padX * 2, minW), ceiling);
  const contentW = inner - padX * 2;
  const pad = " ".repeat(padX);

  const border = (l: string, r: string) => chalk.dim(l + "─".repeat(inner) + r);
  const row = (line: string) => chalk.dim("│") + pad + fitVisible(line, contentW) + pad + chalk.dim("│");

  const out: string[] = [border("╭", "╮")];
  groups.forEach((group, i) => {
    if (i > 0) out.push(border("├", "┤"));
    for (const line of group) out.push(row(line));
  });
  out.push(border("╰", "╯"));
  return out.join("\n");
}
