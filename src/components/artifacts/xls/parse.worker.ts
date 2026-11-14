import { parseLegacyWorkbook } from "./parse";

self.onmessage = (event: MessageEvent<Uint8Array>) => {
  try {
    self.postMessage({ workbook: parseLegacyWorkbook(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error && /^(This file|This workbook)/.test(error.message) ? error.message : "Could not read this workbook. It may be damaged or password-protected." });
  }
};
