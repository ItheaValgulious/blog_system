import type { SnippetLanguageId } from "./workbench/types";

function getFenceMarker(line: string) {
  const trimmed = line.trimStart();
  const match = /^(?<marker>`{3,}|~{3,})/.exec(trimmed);
  return match?.groups?.marker ?? null;
}

export function getSnippetLanguageAtOffset(text: string, offset: number): SnippetLanguageId {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const inspectedText = text.slice(0, safeOffset);
  const lines = inspectedText.split("\n");

  let inFenceMarker: string | null = null;
  let inMath: "inline" | "block" | null = null;

  for (const line of lines) {
    const fenceMarker = getFenceMarker(line);

    if (fenceMarker) {
      if (inFenceMarker === fenceMarker) {
        inFenceMarker = null;
        continue;
      }

      if (!inFenceMarker && !inMath) {
        inFenceMarker = fenceMarker;
        continue;
      }
    }

    if (inFenceMarker) {
      continue;
    }

    let inlineCodeDelimiterLength = 0;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === "\\") {
        index += 1;
        continue;
      }

      if (character === "`") {
        let runLength = 1;
        while (line[index + runLength] === "`") {
          runLength += 1;
        }

        if (inlineCodeDelimiterLength === 0) {
          inlineCodeDelimiterLength = runLength;
        } else if (inlineCodeDelimiterLength === runLength) {
          inlineCodeDelimiterLength = 0;
        }

        index += runLength - 1;
        continue;
      }

      if (inlineCodeDelimiterLength > 0) {
        continue;
      }

      if (character !== "$") {
        continue;
      }

      const delimiterLength = line[index + 1] === "$" ? 2 : 1;
      const nextMath = delimiterLength === 2 ? "block" : "inline";

      if (inMath === nextMath) {
        inMath = null;
      } else if (!inMath) {
        inMath = nextMath;
      }

      index += delimiterLength - 1;
    }
  }

  return inMath ? "latex" : "markdown";
}
