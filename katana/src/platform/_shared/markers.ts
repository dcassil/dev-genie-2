export const KATANA_BEGIN = "<!-- katana:begin -->";
export const KATANA_END = "<!-- katana:end -->";

/**
 * Inject or replace a marker-bracketed block in existing content.
 * Creates content if input is null; replaces or inserts if content exists.
 * Always emits exactly one trailing newline after the end marker.
 */
export function injectMarkerBlock(existing: string | null, block: string): string {
  // Remove any trailing whitespace from block
  const trimmedBlock = block.replace(/\s+$/, "");

  if (existing === null) {
    return `${KATANA_BEGIN}\n${trimmedBlock}\n${KATANA_END}\n`;
  }

  const beginIndex = existing.indexOf(KATANA_BEGIN);
  const endIndex = existing.indexOf(KATANA_END);

  if (beginIndex !== -1 && endIndex !== -1 && beginIndex < endIndex) {
    // Replace existing block. The slice after the end marker already starts
    // with the trailing newline (if any) that was in the source; don't add
    // another one or we double up.
    const before = existing.substring(0, beginIndex);
    const after = existing.substring(endIndex + KATANA_END.length);
    return `${before}${KATANA_BEGIN}\n${trimmedBlock}\n${KATANA_END}${after}`;
  }

  // No valid markers found; append to end
  const trailing = existing.endsWith("\n") ? "" : "\n";
  return `${existing}${trailing}${KATANA_BEGIN}\n${trimmedBlock}\n${KATANA_END}\n`;
}

/**
 * Remove the marker-bracketed block from content (for uninstall).
 * Returns content without the block or markers, plus one trailing newline.
 */
export function stripMarkerBlock(existing: string): string {
  const beginIndex = existing.indexOf(KATANA_BEGIN);
  const endIndex = existing.indexOf(KATANA_END);

  if (beginIndex !== -1 && endIndex !== -1 && beginIndex < endIndex) {
    const before = existing.substring(0, beginIndex);
    let after = existing.substring(endIndex + KATANA_END.length);

    // Remove one trailing newline after end marker if present
    if (after.startsWith("\n")) {
      after = after.substring(1);
    }

    return before + after;
  }

  return existing;
}

/**
 * Check if content has duplicate or unbalanced markers.
 */
export function hasDuplicateMarkers(existing: string): boolean {
  const beginCount = (existing.match(/<!-- katana:begin -->/g) || []).length;
  const endCount = (existing.match(/<!-- katana:end -->/g) || []).length;

  if (beginCount !== endCount) return true;
  if (beginCount > 1) return true;

  return false;
}
