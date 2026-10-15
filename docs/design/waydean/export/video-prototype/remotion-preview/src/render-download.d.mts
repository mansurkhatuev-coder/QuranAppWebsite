import type { Readable, Writable } from "node:stream";

export function pipeRenderDownload(
  stream: Readable,
  response: Writable,
  onUnavailable: (error: Error) => void | Promise<void>
): Readable;
