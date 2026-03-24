import { TFile, normalizePath } from "obsidian";
import { getParentPath, isLikelyImagePath, isRemotePath, relativePath, stripAngleBrackets } from "./path-utils";
import { CloudImageEmbed, LocalImageEmbed } from "./types";

const WIKI_IMAGE_REGEX = /!\[\[([^\]\n]+)\]\]/g;
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

function toCloudPath(baseUrl: string, candidate: string): string | null {
  const cleaned = stripAngleBrackets(candidate).trim();
  if (cleaned.length === 0) {
    return null;
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (cleaned.startsWith("/file/")) {
    return cleaned.replace(/^\/+/, "");
  }

  if (cleaned.startsWith(`${normalizedBase}/file/`)) {
    const relative = cleaned.slice(normalizedBase.length + 1);
    return relative.replace(/^\/+/, "");
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.pathname.startsWith("/file/")) {
      return parsed.pathname.replace(/^\/+/, "");
    }
  } catch {
    return null;
  }

  return null;
}

export function buildCloudUrl(baseUrl: string, src: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(src)) {
    return src;
  }
  if (src.startsWith("/")) {
    return `${normalizedBase}${src}`;
  }
  return `${normalizedBase}/${src}`;
}

export function findLocalImageEmbeds(
  content: string,
  sourceFile: TFile,
  resolveWikiLink: (linktext: string, sourcePath: string) => TFile | null,
): LocalImageEmbed[] {
  const embeds: LocalImageEmbed[] = [];

  for (const match of content.matchAll(WIKI_IMAGE_REGEX)) {
    const raw = match[0];
    const linkContent = match[1]?.trim() ?? "";
    const targetPart = linkContent.split("|")[0]?.trim() ?? "";
    if (!targetPart || isRemotePath(targetPart) || !isLikelyImagePath(targetPart)) {
      continue;
    }

    const dest = resolveWikiLink(targetPart, sourceFile.path);
    if (!dest) {
      continue;
    }

    embeds.push({
      raw,
      syntax: "wiki",
      altText: "",
      targetRaw: targetPart,
      resolvedPath: dest.path,
    });
  }

  for (const match of content.matchAll(MARKDOWN_IMAGE_REGEX)) {
    const raw = match[0];
    const altText = match[1] ?? "";
    const target = stripAngleBrackets(match[2] ?? "").trim();
    if (!target || isRemotePath(target) || !isLikelyImagePath(target)) {
      continue;
    }

    const sourceDir = getParentPath(sourceFile.path);
    const resolved = normalizePath(sourceDir ? `${sourceDir}/${target}` : target);

    embeds.push({
      raw,
      syntax: "markdown",
      altText,
      targetRaw: target,
      resolvedPath: resolved,
    });
  }

  return embeds;
}

export function findCloudImageEmbeds(content: string, baseUrl: string): CloudImageEmbed[] {
  const embeds: CloudImageEmbed[] = [];

  for (const match of content.matchAll(WIKI_IMAGE_REGEX)) {
    const raw = match[0];
    const linkContent = match[1]?.trim() ?? "";
    const targetPart = linkContent.split("|")[0]?.trim() ?? "";
    const cloudPath = toCloudPath(baseUrl, targetPart);
    if (!cloudPath) {
      continue;
    }

    embeds.push({
      raw,
      syntax: "wiki",
      altText: "",
      cloudPath,
      fullUrl: buildCloudUrl(baseUrl, `/${cloudPath}`),
    });
  }

  for (const match of content.matchAll(MARKDOWN_IMAGE_REGEX)) {
    const raw = match[0];
    const altText = match[1] ?? "";
    const target = stripAngleBrackets(match[2] ?? "").trim();
    const cloudPath = toCloudPath(baseUrl, target);
    if (!cloudPath) {
      continue;
    }

    embeds.push({
      raw,
      syntax: "markdown",
      altText,
      cloudPath,
      fullUrl: buildCloudUrl(baseUrl, `/${cloudPath}`),
    });
  }

  return embeds;
}

export function toMarkdownImage(altText: string, target: string): string {
  const shouldWrapInAngleBrackets =
    target.includes(" ") || target.includes("(") || target.includes(")");

  if (shouldWrapInAngleBrackets) {
    return `![${altText}](<${target}>)`;
  }

  return `![${altText}](${target})`;
}

export function toRelativeLink(fromFile: TFile, absoluteTargetPath: string): string {
  const fromDir = getParentPath(fromFile.path);
  return relativePath(fromDir, absoluteTargetPath);
}
