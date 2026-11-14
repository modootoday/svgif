/**
 * Browser capability probe for this page.
 * SharedArrayBuffer is not read and is not a fallback.
 * The WebP writer in the export package is pure JavaScript, so a missing
 * WebAssembly instantiate still leaves WebP available when canvas can paint.
 */

export interface CapabilityFlags {
  canvasBlobSvg: boolean;
  webWorkers: boolean;
  offscreenCanvas: boolean;
  videoEncoder: boolean;
  mediaRecorderWebm: boolean;
  wasmInstantiate: boolean;
  /** True when the pure-JS WebP writer from the export package is bundled. */
  pureJsWebp: boolean;
}

export interface CodecChoice {
  enabled: boolean;
  reason: string;
}

export interface ExportDecision {
  flags: CapabilityFlags;
  thread: "worker" | "main";
  canvas: "offscreen" | "main" | "missing";
  webmPath: "video-encoder" | "media-recorder" | "disabled";
  webpEncoder: "wasm" | "pure-js" | "disabled";
  html: CodecChoice;
  svg: CodecChoice;
  webp: CodecChoice;
  webm: CodecChoice;
  mp4: CodecChoice;
  sharedArrayBuffer: "not used";
}

export const PURE_JS_WEBP = true;

export function probeCapabilities(): CapabilityFlags {
  const canvasBlobSvg = canPaintBlobSvg();
  const mediaRecorderWebm = canRecordWebm();
  const wasm = globalThis.WebAssembly;
  return {
    canvasBlobSvg,
    webWorkers: typeof globalThis.Worker === "function",
    offscreenCanvas: typeof globalThis.OffscreenCanvas === "function",
    videoEncoder: typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === "function",
    mediaRecorderWebm,
    wasmInstantiate: typeof wasm?.instantiate === "function",
    pureJsWebp: PURE_JS_WEBP,
  };
}

function canPaintBlobSvg(): boolean {
  if (typeof Blob !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const documentRef = globalThis.document;
  if (!documentRef || typeof documentRef.createElement !== "function") return false;
  try {
    const canvas = documentRef.createElement("canvas");
    return typeof canvas.getContext === "function" && canvas.getContext("2d") !== null;
  } catch {
    return false;
  }
}

function canRecordWebm(): boolean {
  const recorder = (globalThis as { MediaRecorder?: { isTypeSupported?: (mime: string) => boolean } }).MediaRecorder;
  if (typeof recorder !== "function") return false;
  if (typeof recorder.isTypeSupported !== "function") return false;
  return recorder.isTypeSupported("video/webm;codecs=vp9") || recorder.isTypeSupported("video/webm;codecs=vp8") || recorder.isTypeSupported("video/webm");
}

export function exportSupport(flags: CapabilityFlags = probeCapabilities()): ExportDecision {
  const thread = flags.webWorkers ? "worker" : "main";
  const canvas = !flags.canvasBlobSvg ? "missing" : flags.offscreenCanvas ? "offscreen" : "main";
  let webmPath: ExportDecision["webmPath"] = "disabled";
  let webmReason = "WebM stays off because this browser has no VideoEncoder and no webm MediaRecorder.";
  if (!flags.canvasBlobSvg) {
    webmReason = "WebM stays off because canvas and blob SVG are missing.";
  } else if (flags.videoEncoder) {
    webmPath = "video-encoder";
    webmReason = "WebM uses VideoEncoder in the page.";
  } else if (flags.mediaRecorderWebm) {
    webmPath = "media-recorder";
    webmReason = "VideoEncoder is missing. WebM uses MediaRecorder.";
  }
  let webpEncoder: ExportDecision["webpEncoder"] = "disabled";
  let webpReason = "WebP stays off.";
  if (!flags.canvasBlobSvg) {
    webpReason = "WebP stays off because canvas and blob SVG are missing.";
  } else if (flags.wasmInstantiate) {
    webpEncoder = flags.pureJsWebp ? "pure-js" : "wasm";
    webpReason = flags.pureJsWebp
      ? "WebP uses the pure-JS encoder bundled with the export package. WebAssembly instantiate is available and is not required."
      : "WebP uses WebAssembly instantiate.";
  } else if (flags.pureJsWebp) {
    webpEncoder = "pure-js";
    webpReason = "WebAssembly instantiate is missing. WebP uses the pure-JS encoder bundled with the export package.";
  } else {
    webpReason = "WebP stays off because WebAssembly instantiate is missing and no pure-JS encoder is bundled.";
  }
  const threadNote = flags.webWorkers ? "Encode can run on a worker." : "Web Workers are missing, so encode stays on the main thread.";
  const canvasNote = flags.offscreenCanvas
    ? "OffscreenCanvas is available."
    : flags.canvasBlobSvg
      ? "OffscreenCanvas is missing, so the canvas stays on the main thread."
      : "Canvas and blob SVG are missing.";
  return {
    flags,
    thread,
    canvas,
    webmPath,
    webpEncoder,
    html: { enabled: true, reason: "HTML is written in the page." },
    svg: { enabled: true, reason: "SVG is compiled in the page." },
    webp: { enabled: webpEncoder !== "disabled", reason: `${webpReason} ${threadNote} ${canvasNote}` },
    webm: { enabled: webmPath !== "disabled", reason: `${webmReason} ${threadNote} ${canvasNote}` },
    mp4: { enabled: true, reason: "MP4 is written in the page. No upload." },
    sharedArrayBuffer: "not used",
  };
}
