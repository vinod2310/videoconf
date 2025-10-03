import { exportPubJwk } from './crypto'
import { sha256Base64url } from './crypto'
import { signES256 } from './crypto'
import { base64url } from './crypto'

// let seq = 0;
// function uniqueFragmentKey(meetingId: string, userId: string): string {
//   // Use Web Crypto if available; otherwise Node’s crypto
//   const uuid =
//     typeof crypto !== "undefined" && "randomUUID" in crypto
//       ? crypto.randomUUID()
//       : require("crypto").randomUUID();

//   // Compact timestamp (YYYYMMDDHHMMSSmmm)
//   const ts = new Date().toISOString().replace(/[-:.TZ]/g, "");
//   seq = (seq + 1) & 0xffff; // 0..65535 then wrap

//   return `${meetingId}-${userId}-${ts}-${seq.toString(16).padStart(4, "0")}-${uuid}.webm`;
// }
type Uploader = (path: string, bytes: Uint8Array | Blob) => Promise<string>; // returns URL or etag

export async function startSignedRecording(params: {
  stream: MediaStream;
  participantId: string;
  sessionId: string;
  uploader: Uploader;           // e.g., S3 presigned upload
  keyPair: CryptoKeyPair;
  mimeType?: string;            // try "video/webm;codecs=vp9,opus"
  timesliceMs?: number;         // default ~2000
}) {
  const { stream, sessionId, participantId, uploader, keyPair } = params;
  const pubJwk = await exportPubJwk(keyPair.publicKey);
  const mimeType = params.mimeType ?? (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm");
  const timeslice = params.timesliceMs ?? 10_000;

  let seq = 0;
  let prevSig = "0".repeat(86); // 64 bytes base64url would be longer; use fixed placeholder on first

  const mr = new MediaRecorder(stream, { mimeType });
  mr.ondataavailable = async (ev) => {
    if (!ev.data || ev.data.size === 0) return;
    const start = Date.now() - ev.timecode; // timecode is experimental; if not present, track wall clock yourself
    const end = Date.now();

    const blob = ev.data;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await sha256Base64url(bytes.buffer);

    const signingPayload = {
      session_id: sessionId,
      seq,
      start_ms: start,
      end_ms: end,
      hash,
      prev_sig: prevSig
    };
    const signingMessage = JSON.stringify(signingPayload);
    const sig = await signES256(keyPair.privateKey, signingMessage);

    // Prepare sidecar
    const sidecar = {
      schema: "vreal-chunk-signing-1",
      session_id: sessionId,
      participant_id: participantId,
      key: { alg: "ES256", pub_jwk: pubJwk, kid: await sha256Base64url(new TextEncoder().encode(JSON.stringify(pubJwk))) },
      chunk: {
        seq,
        start_ms: start,
        end_ms: end,
        byte_len: bytes.byteLength,
        mime: blob.type || mimeType,
        hash: `sha256:${hash}`
      },
      chain: { prev_sig: prevSig },
      signature: {
        alg: "ES256",
        sig,
        signing_message: base64url(new TextEncoder().encode(signingMessage))
      }
    };
    // const video_fragment_filename = uniqueFragmentKey(sessionId, participantId);

    // Upload media first, then sidecar
    const mediaPath = `${sessionId}/${participantId}/media/${String(seq).padStart(8, "0")}.webm`;
    const metaPath  = `${sessionId}/${participantId}/meta/${String(seq).padStart(8, "0")}.json`;

    await uploader(mediaPath, blob);
    await uploader(metaPath, new Blob([JSON.stringify(sidecar)], { type: "application/json" }));

    // Update chain
    prevSig = sig;
    seq += 1;
  };

  mr.start(timeslice);
  return () => mr.stop(); // returns a stopper
}
