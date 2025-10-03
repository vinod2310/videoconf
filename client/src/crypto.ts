// crypto.ts
export async function ensureKeyPair(): Promise<CryptoKeyPair> {
    // non-extractable private key; persist via IndexedDB (browser does this for CryptoKey)
    const key = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true, // extractable public key ok
      ["sign", "verify"]
    );
    // store in indexedDB using your own wrapper OR rely on keeping it in memory for prototype
    return key;
  }
  
  export async function exportPubJwk(publicKey: CryptoKey) {
    const jwk = await crypto.subtle.exportKey("jwk", publicKey);
    return jwk; // {kty:"EC", crv:"P-256", x, y}
  }
  
  export async function sha256Base64url(buf: ArrayBuffer) {
    const h = await crypto.subtle.digest("SHA-256", buf);
    return base64url(new Uint8Array(h));
  }
  
  export function base64url(u8: Uint8Array) {
    let s = btoa(String.fromCharCode(...u8));
    return s.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  
  export async function signES256(privateKey: CryptoKey, dataUtf8: string) {
    const enc = new TextEncoder();
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      enc.encode(dataUtf8)
    );
    return base64url(new Uint8Array(sig));
  }
  