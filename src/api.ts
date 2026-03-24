import { requestUrl } from "obsidian";
import { ensureLeadingSlash, ensureNoTrailingSlash } from "./path-utils";

export interface UploadResult {
  src: string;
}

interface UploadResponseItem {
  src: string;
}

export class CloudflareImgBedClient {
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  private buildUrl(path: string): string {
    return `${ensureNoTrailingSlash(this.baseUrl)}${ensureLeadingSlash(path)}`;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  async uploadBinary(fileName: string, binary: ArrayBuffer): Promise<UploadResult> {
    const url = this.buildUrl("/upload");
    const formData = new FormData();
    const blob = new Blob([binary]);
    formData.append("file", blob, fileName);

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as UploadResponseItem[] | { data?: UploadResponseItem[] };
    const item = Array.isArray(payload) ? payload[0] : payload.data?.[0];
    if (!item?.src) {
      throw new Error("Upload response does not contain src");
    }

    return { src: item.src };
  }

  async deleteByCloudPath(cloudPath: string): Promise<void> {
    const trimmed = cloudPath.replace(/^\/+/, "");
    const encodedPath = trimmed
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const url = this.buildUrl(`/api/manage/delete/${encodedPath}`);

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Delete failed (${response.status}): ${text}`);
    }
  }

  async downloadBinary(fileUrl: string): Promise<ArrayBuffer> {
    const response = await requestUrl({
      url: fileUrl,
      method: "GET",
    });

    return response.arrayBuffer;
  }
}
