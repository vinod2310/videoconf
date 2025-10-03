export async function getPresignedURL(
    bucket: string,
    key: string,
    action: string
  ): Promise<string | null> {
    try {
      const params = new URLSearchParams({
        bucket,
        key,
        action,
      });
  
      // const url = `https://vreal-gallery.com/api/web/presigned_v2?${params.toString()}`;
      const url = `http://localhost:8000/web/presigned_v4?${params.toString()}`;
      const res = await fetch(url, { method: "GET" });
  
      if (!res.ok) {
        console.error("Presign request failed:", res.status, res.statusText);
        return null;
      }
  
      const data: { url?: string } = await res.json();
      if (data.url) {
        return data.url;
      } else {
        console.error("Invalid JSON structure:", data);
        return null;
      }
    } catch (err) {
      console.error("Presign request error:", err);
      return null;
    }
  }
  