import { App, Notice, TFile, debounce, normalizePath } from "obsidian";
import { CloudflareImgBedClient } from "./api";
import { findCloudImageEmbeds, findLocalImageEmbeds, toMarkdownImage, toRelativeLink, buildCloudUrl } from "./markdown";
import { getFileName, getParentPath, joinPath } from "./path-utils";
import type MyPlugin from "./main";
import { ProcessResult, ScanScope } from "./types";

export class ImageSyncService {
  private isRunningForFile = new Set<string>();
  private cloudReferenceSnapshot = new Map<string, Set<string>>();

  private readonly debouncedAutoProcess = debounce(async (file: TFile) => {
    if (!this.plugin.settings.autoUploadOnPaste) {
      return;
    }
    if (!this.hasCredentials()) {
      return;
    }
    await this.uploadLocalImagesInFile(file, this.plugin.settings.deleteLocalAfterUpload);
  }, 1200, true);

  constructor(private readonly plugin: MyPlugin, private readonly app: App) {}

  async initializeSnapshots(): Promise<void> {
    const markdownFiles = this.app.vault.getMarkdownFiles();
    for (const file of markdownFiles) {
      const content = await this.app.vault.cachedRead(file);
      const refs = new Set(findCloudImageEmbeds(content, this.plugin.settings.baseUrl).map((it) => it.cloudPath));
      this.cloudReferenceSnapshot.set(file.path, refs);
    }
  }

  registerEvents(): void {
    this.plugin.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        if (this.isRunningForFile.has(file.path)) {
          return;
        }

        await this.handleCloudReferenceDeletion(file);
        this.debouncedAutoProcess(file);
      }),
    );

    this.plugin.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.cloudReferenceSnapshot.delete(file.path);
        }
      }),
    );

    this.plugin.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }
        const previous = this.cloudReferenceSnapshot.get(oldPath);
        if (previous) {
          this.cloudReferenceSnapshot.set(file.path, previous);
          this.cloudReferenceSnapshot.delete(oldPath);
        }
      }),
    );
  }

  async uploadByScope(scope: ScanScope, deleteLocalAfterUpload: boolean): Promise<ProcessResult> {
    if (!this.hasCredentials()) {
      throw new Error("Please set base URL and token first.");
    }

    const files = this.getScopeMarkdownFiles(scope);
    if (files.length === 0) {
      throw new Error("No markdown files found for current scope");
    }

    const result: ProcessResult = {
      updated: false,
      uploadedCount: 0,
      downloadedCount: 0,
      deletedLocalCount: 0,
      deletedRemoteCount: 0,
    };

    for (const file of files) {
      const perFile = await this.uploadLocalImagesInFile(file, deleteLocalAfterUpload);
      result.updated = result.updated || perFile.updated;
      result.uploadedCount += perFile.uploadedCount;
      result.deletedLocalCount += perFile.deletedLocalCount;
    }

    return result;
  }

  async downloadByScope(scope: ScanScope): Promise<ProcessResult> {
    if (!this.hasCredentials()) {
      throw new Error("Please set base URL and token first.");
    }

    const client = this.getClient();
    const files = this.getScopeMarkdownFiles(scope);
    if (files.length === 0) {
      throw new Error("No markdown files found for current scope");
    }

    const result: ProcessResult = {
      updated: false,
      uploadedCount: 0,
      downloadedCount: 0,
      deletedLocalCount: 0,
      deletedRemoteCount: 0,
    };

    const folderRoot = this.getScopeRootFolder(scope);
    const targetAttachmentFolder = joinPath(folderRoot, "attachment");
    await this.ensureFolder(targetAttachmentFolder);

    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const cloudEmbeds = findCloudImageEmbeds(content, this.plugin.settings.baseUrl);
      if (cloudEmbeds.length === 0) {
        continue;
      }

      let updatedContent = content;
      const replacementMap = new Map<string, string>();

      for (const embed of cloudEmbeds) {
        if (replacementMap.has(embed.raw)) {
          continue;
        }

        const fileName = this.uniqueFileName(targetAttachmentFolder, getFileName(embed.cloudPath));
        const savePath = joinPath(targetAttachmentFolder, fileName);
        const binary = await client.downloadBinary(embed.fullUrl);
        await this.app.vault.adapter.writeBinary(normalizePath(savePath), binary);

        const relative = toRelativeLink(file, savePath);
        const replacement = toMarkdownImage(embed.altText, relative);

        replacementMap.set(embed.raw, replacement);
        result.downloadedCount += 1;
      }

      for (const [from, to] of replacementMap.entries()) {
        updatedContent = updatedContent.split(from).join(to);
      }

      if (updatedContent !== content) {
        await this.withFileLock(file.path, async () => {
          await this.app.vault.modify(file, updatedContent);
        });
        result.updated = true;
        this.updateSnapshotForContent(file.path, updatedContent);
      }
    }

    return result;
  }

  async uploadLocalImagesInFile(file: TFile, deleteLocalAfterUpload: boolean): Promise<ProcessResult> {
    const result: ProcessResult = {
      updated: false,
      uploadedCount: 0,
      downloadedCount: 0,
      deletedLocalCount: 0,
      deletedRemoteCount: 0,
    };

    if (!this.hasCredentials()) {
      return result;
    }

    const content = await this.app.vault.cachedRead(file);
    const localEmbeds = findLocalImageEmbeds(content, file, (link, sourcePath) => this.app.metadataCache.getFirstLinkpathDest(link, sourcePath));
    if (localEmbeds.length === 0) {
      this.updateSnapshotForContent(file.path, content);
      return result;
    }

    const client = this.getClient();
    let updatedContent = content;
    const replacementMap = new Map<string, string>();
    const uploadedSources = new Set<string>();

    for (const embed of localEmbeds) {
      if (replacementMap.has(embed.raw)) {
        continue;
      }

      const abstractFile = this.app.vault.getAbstractFileByPath(embed.resolvedPath);
      if (!(abstractFile instanceof TFile)) {
        continue;
      }

      const binary = await this.app.vault.adapter.readBinary(embed.resolvedPath);
      const uploadResult = await client.uploadBinary(abstractFile.name, binary);
      const cloudUrl = buildCloudUrl(this.plugin.settings.baseUrl, uploadResult.src);
      const replacement = toMarkdownImage(embed.altText, cloudUrl);
      replacementMap.set(embed.raw, replacement);
      result.uploadedCount += 1;

      if (deleteLocalAfterUpload) {
        uploadedSources.add(embed.resolvedPath);
      }
    }

    for (const [from, to] of replacementMap.entries()) {
      updatedContent = updatedContent.split(from).join(to);
    }

    if (updatedContent !== content) {
      await this.withFileLock(file.path, async () => {
        await this.app.vault.modify(file, updatedContent);
      });
      result.updated = true;
      this.updateSnapshotForContent(file.path, updatedContent);
    } else {
      this.updateSnapshotForContent(file.path, content);
    }

    if (deleteLocalAfterUpload && uploadedSources.size > 0) {
      for (const sourcePath of uploadedSources) {
        if (await this.isFileReferencedInMarkdown(sourcePath)) {
          continue;
        }
        const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
        if (sourceFile instanceof TFile) {
          await this.app.vault.delete(sourceFile);
          result.deletedLocalCount += 1;
        }
      }
    }

    return result;
  }

  private async handleCloudReferenceDeletion(file: TFile): Promise<void> {
    const content = await this.app.vault.cachedRead(file);
    const currentRefs = new Set(findCloudImageEmbeds(content, this.plugin.settings.baseUrl).map((it) => it.cloudPath));
    const previousRefs = this.cloudReferenceSnapshot.get(file.path) ?? new Set<string>();
    this.cloudReferenceSnapshot.set(file.path, currentRefs);

    if (!this.plugin.settings.deleteRemoteWhenReferenceRemoved) {
      return;
    }
    if (!this.hasCredentials()) {
      return;
    }

    const removedRefs = [...previousRefs].filter((path) => !currentRefs.has(path));
    if (removedRefs.length === 0) {
      return;
    }

    const client = this.getClient();
    for (const cloudPath of removedRefs) {
      const stillUsed = await this.isCloudPathStillReferenced(cloudPath, file.path);
      if (stillUsed) {
        continue;
      }

      try {
        await client.deleteByCloudPath(cloudPath);
      } catch (error) {
        console.error("Failed to delete remote image", cloudPath, error);
        new Notice(`Delete remote image failed: ${cloudPath}`);
      }
    }
  }

  private getScopeMarkdownFiles(scope: ScanScope): TFile[] {
    const active = this.app.workspace.getActiveFile();
    if (!active) {
      throw new Error("No active markdown file");
    }

    if (scope === "file") {
      return [active];
    }

    const folderPath = active.parent?.path;
    if (!folderPath) {
      return [active];
    }

    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path === active.path || file.path.startsWith(`${folderPath}/`));
  }

  private getScopeRootFolder(scope: ScanScope): string {
    const active = this.app.workspace.getActiveFile();
    if (!active) {
      throw new Error("No active markdown file");
    }

    if (scope === "file") {
      return getParentPath(active.path);
    }

    return active.parent?.path ?? getParentPath(active.path);
  }

  private hasCredentials(): boolean {
    return this.plugin.settings.baseUrl.trim().length > 0 && this.plugin.settings.apiToken.trim().length > 0;
  }

  private getClient(): CloudflareImgBedClient {
    return new CloudflareImgBedClient(this.plugin.settings.baseUrl.trim(), this.plugin.settings.apiToken.trim());
  }

  private async withFileLock(filePath: string, action: () => Promise<void>): Promise<void> {
    this.isRunningForFile.add(filePath);
    try {
      await action();
    } finally {
      this.isRunningForFile.delete(filePath);
    }
  }

  private updateSnapshotForContent(filePath: string, content: string): void {
    const refs = new Set(findCloudImageEmbeds(content, this.plugin.settings.baseUrl).map((it) => it.cloudPath));
    this.cloudReferenceSnapshot.set(filePath, refs);
  }

  private async isCloudPathStillReferenced(cloudPath: string, excludeFilePath: string): Promise<boolean> {
    const fullUrl = buildCloudUrl(this.plugin.settings.baseUrl, `/${cloudPath}`);
    const directPath = `/${cloudPath}`;

    for (const markdownFile of this.app.vault.getMarkdownFiles()) {
      if (markdownFile.path === excludeFilePath) {
        continue;
      }

      const content = await this.app.vault.cachedRead(markdownFile);
      if (content.includes(fullUrl) || content.includes(directPath)) {
        return true;
      }
    }

    return false;
  }

  private async isFileReferencedInMarkdown(targetPath: string): Promise<boolean> {
    for (const markdownFile of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(markdownFile);
      if (content.includes(targetPath) || content.includes(getFileName(targetPath))) {
        return true;
      }
    }
    return false;
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath);
    if (normalized.length === 0) {
      return;
    }

    const found = this.app.vault.getAbstractFileByPath(normalized);
    if (found) {
      return;
    }

    const segments = normalized.split("/");
    let current = "";
    for (const segment of segments) {
      current = current.length === 0 ? segment : `${current}/${segment}`;
      const exists = this.app.vault.getAbstractFileByPath(current);
      if (!exists) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private uniqueFileName(folderPath: string, preferredName: string): string {
    const dot = preferredName.lastIndexOf(".");
    const base = dot === -1 ? preferredName : preferredName.substring(0, dot);
    const ext = dot === -1 ? "" : preferredName.substring(dot);

    let index = 0;
    while (true) {
      const candidate = index === 0 ? `${base}${ext}` : `${base}-${index}${ext}`;
      const fullPath = joinPath(folderPath, candidate);
      const exists = this.app.vault.getAbstractFileByPath(fullPath);
      if (!exists) {
        return candidate;
      }
      index += 1;
    }
  }
}
