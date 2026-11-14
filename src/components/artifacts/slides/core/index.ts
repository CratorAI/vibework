/**
 * Entry point of the slides core: parsing, write-back, rendering and export.
 * Also bundled into .vibework/skills/vibework-slides/scripts/deckCore.js for
 * the agent's export script (see ../build-skill-core.ts).
 */
export * from "./inline";
export * from "./parse";
export * from "./edit";
export * from "./charts";
export * from "./themes";
export * from "./render";
export * from "./print";
export { buildPptx, imageSize, type LoadedImage, type PptxOptions } from "./pptx";
