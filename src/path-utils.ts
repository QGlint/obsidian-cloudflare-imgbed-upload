import { normalizePath } from "obsidian";

export function ensureNoTrailingSlash(input: string): string {
  return input.replace(/\/+$/, "");
}

export function ensureLeadingSlash(input: string): string {
  return input.startsWith("/") ? input : `/${input}`;
}

export function getParentPath(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.substring(0, index);
}

export function getFileName(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.substring(index + 1);
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter((part) => part.length > 0).join("/"));
}

export function stripAngleBrackets(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.substring(1, trimmed.length - 1);
  }
  return trimmed;
}

export function isLikelyImagePath(path: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|svg|bmp|heic|heif|avif)$/i.test(path);
}

export function isRemotePath(path: string): boolean {
  return /^(https?:)?\/\//i.test(path) || /^data:/i.test(path);
}

export function relativePath(fromDir: string, toPath: string): string {
  const fromSegments = normalizePath(fromDir).split("/").filter(Boolean);
  const toSegments = normalizePath(toPath).split("/").filter(Boolean);

  let common = 0;
  while (
    common < fromSegments.length &&
    common < toSegments.length &&
    fromSegments[common] === toSegments[common]
  ) {
    common += 1;
  }

  const up = new Array(fromSegments.length - common).fill("..");
  const down = toSegments.slice(common);
  const result = [...up, ...down].join("/");
  return result.length === 0 ? "." : result;
}
