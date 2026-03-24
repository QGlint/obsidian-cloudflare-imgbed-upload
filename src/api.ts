import { requestUrl } from "obsidian";
import { ensureLeadingSlash, ensureNoTrailingSlash } from "./path-utils";

export interface UploadResult {
  src: string;
}

interface UploadResponseItem {
  src: string;
}

function createMultipartBody(
  fileName: string,
  binary: ArrayBuffer,
): { boundary: string; body: ArrayBuffer } {
  const boundary = `----obsidian-cloudflare-imgbed-${Date.now()}`;
  const encoder = new TextEncoder();
  const header = encoder.encode(
    `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`
      + "Content-Type: application/octet-stream\r\n\r\n",
  );
  const footer = encoder.encode(`\r\n--${boundary}--\r\n`);
  const fileBytes = new Uint8Array(binary);
  const merged = new Uint8Array(header.length + fileBytes.length + footer.length);
  merged.set(header, 0);
  merged.set(fileBytes, header.length);
  merged.set(footer, header.length + fileBytes.length);
  return { boundary, body: merged.buffer };
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
    const { boundary, body } = createMultipartBody(fileName, binary);

    const response = await requestUrl({
      url,
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(`Upload failed (${response.status}): ${response.text}`);
    }

    const payload = response.json as UploadResponseItem[] | { data?: UploadResponseItem[] };
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

    const response = await requestUrl({
      url,
      method: "DELETE",
      headers: this.getHeaders(),
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(`Delete failed (${response.status}): ${response.text}`);
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
