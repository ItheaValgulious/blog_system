/**
 * Parse the info-string (everything after the language token on a fenced code
 * block opening line) of a commutative fence.
 *
 * Examples:
 *   ```commutative
 *   ```commutative width=100% scale=1.5 align=left
 *   ```commutative width="auto"  scale=0.8
 *
 * Unknown keys are kept verbatim under `raw` so future fence options can be
 * added without breaking older render passes.
 */

export interface CommutativeFenceParams {
  /** CSS width value applied to the wrapping figure; empty string keeps the SVG default. */
  width: string;
  /** Multiplicative scale; 1 means no scaling. */
  scale: number;
  /** Alignment of the figure within its parent block. */
  align: "left" | "center" | "right";
  /** Every key=value pair found in the info-string, including the recognised ones. */
  raw: Record<string, string>;
}

const KEY_VALUE_RE = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=]+))/g;

export function parseFenceParams(infoString: string | undefined): CommutativeFenceParams {
  const raw: Record<string, string> = {};
  if (typeof infoString === "string" && infoString.trim() !== "") {
    KEY_VALUE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = KEY_VALUE_RE.exec(infoString)) !== null) {
      const key = match[1];
      const value = match[3] ?? match[4] ?? match[5] ?? "";
      raw[key] = value;
    }
  }

  const width = typeof raw.width === "string" ? raw.width.trim() : "";
  const scaleNumber = raw.scale !== undefined ? Number(raw.scale) : 1;
  const scale = Number.isFinite(scaleNumber) && scaleNumber > 0 ? scaleNumber : 1;
  const alignRaw = (raw.align ?? "").toLowerCase();
  const align: "left" | "center" | "right" =
    alignRaw === "left" || alignRaw === "right" ? alignRaw : "center";

  return { width, scale, align, raw };
}
