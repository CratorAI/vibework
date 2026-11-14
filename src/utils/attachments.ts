import { AttachmentData } from "../components/AttachmentChip";

/**
 * Parse attachment tags from message text
 * Extracts all <vibe-work-attachment>path</vibe-work-attachment> tags
 *
 * @param text - The message text containing attachment tags
 * @returns Object with attachments array and cleaned text (without tags)
 */
export function parseAttachments(text: string): {
  attachments: AttachmentData[];
  cleanedText: string;
} {
  const attachments: AttachmentData[] = [];
  const regex = /<vibe-work-attachment>(.*?)<\/vibe-work-attachment>/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const path = match[1].trim();
    // Extract filename from path
    const name = path.split("/").pop() || path;

    attachments.push({
      path,
      name,
      // Size is not available when parsing from text
      size: undefined,
    });
  }

  // Remove attachment tags from text
  const cleanedText = text
    .replace(regex, "")
    .trim();

  return { attachments, cleanedText };
}

/**
 * Check if text contains any attachment tags
 */
export function hasAttachments(text: string): boolean {
  return /<vibe-work-attachment>.*?<\/vibe-work-attachment>/.test(text);
}
