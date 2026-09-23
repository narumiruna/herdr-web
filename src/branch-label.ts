export function compactBranchLabel(branch: string, maxLength = 24): string {
  const length = Math.max(0, Math.floor(maxLength));
  if (branch.length <= length) return branch;
  if (length === 0) return "";
  if (length < 5) return branch.slice(-length);

  const segments = branch.split("/").filter(Boolean);
  if (segments.length > 1) {
    const separator = "/…/";
    const available = length - separator.length;
    const first = segments[0] ?? "";
    const last = segments.at(-1) ?? "";
    const prefixLength = Math.min(
      first.length,
      Math.max(1, available - Math.ceil(available * 0.6)),
    );
    const suffixLength = available - prefixLength;
    return `${first.slice(0, prefixLength)}${separator}${last.slice(-suffixLength)}`;
  }

  const prefixLength = Math.max(1, Math.floor((length - 1) / 3));
  const suffixLength = length - prefixLength - 1;
  return `${branch.slice(0, prefixLength)}…${branch.slice(-suffixLength)}`;
}
