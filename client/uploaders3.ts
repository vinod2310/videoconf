
export async function makeS3Uploader(getPresignedUrl: (path: string, type: string) => Promise<string>) {
    return async (path: string, data: Uint8Array | Blob) => {
      const contentType = data instanceof Blob ? data.type || "application/octet-stream" : "application/octet-stream";
      const url = await getPresignedUrl(path, contentType);
      const res = await fetch(url, { method: "PUT", body: data, headers: { "Content-Type": contentType }});
      if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
      return res.headers.get("ETag") || "";
    };
  }
  