export type ScanScope = "file" | "folder";

export interface LocalImageEmbed {
  raw: string;
  syntax: "wiki" | "markdown";
  altText: string;
  targetRaw: string;
  resolvedPath: string;
}

export interface CloudImageEmbed {
  raw: string;
  syntax: "wiki" | "markdown";
  altText: string;
  cloudPath: string;
  fullUrl: string;
}

export interface ProcessResult {
  updated: boolean;
  uploadedCount: number;
  downloadedCount: number;
  deletedLocalCount: number;
  deletedRemoteCount: number;
}
