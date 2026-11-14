import { describe, expect, it, vi } from "vitest";
import { assignBadge, badgeCandidates, folderBadgeLook, folderInitials } from "../FolderBadge";

describe("folder badges", () => {
  it("keeps the name's own letters and hue first", () => {
    expect(badgeCandidates("deck")[0]).toEqual({ letters: folderInitials("deck"), hue: badgeCandidates("deck")[0].hue });
  });
  it("tells colliding folders apart: other letters first, then colour", () => {
    expect(folderInitials("deck")).toBe("DC");
    expect(folderInitials("doc")).toBe("DC");
    const deck = assignBadge("deck", []);
    const doc = assignBadge("doc", [deck]);
    // Letters differ first, whatever the hues
    expect(doc.letters).not.toBe(deck.letters);
    expect(assignBadge("t7a", [assignBadge("t7b", [])]).letters).toBe("TA");
    // Same name in two places: same letters, another colour
    const taken = [deck, ...badgeCandidates("deck").slice(1).filter((c) => c.hue === deck.hue)];
    const other = assignBadge("deck", taken);
    expect(other.letters).toBe(deck.letters);
    expect(other.hue).not.toBe(deck.hue);
    // and not a hue too close to it
    expect(["amber", "orange"].includes(other.hue) && ["amber", "orange"].includes(deck.hue)).toBe(false);
  });
  it("is deterministic and keeps a folder's badge once given", () => {
    expect(assignBadge("doc", [assignBadge("deck", [])])).toEqual(assignBadge("doc", [assignBadge("deck", [])]));
    const first = folderBadgeLook("/tmp/a/deck");
    folderBadgeLook("/tmp/b/doc");
    expect(folderBadgeLook("/tmp/a/deck/")).toEqual(first);
    expect(folderBadgeLook("/tmp/b/doc")).not.toEqual(first);
  });
});

describe('folder initials', () => {
  it.each([
    ["Marlowe's Café", 'MC'], ['Marlowe’s Café', 'MC'],
    ['q3-board', 'QB'], ['my_project files', 'MP'],
    ['vibework', 'VW'], ['dev', 'DV'], ['Downloads', 'DL'],
    ['École Café', 'ÉC'], ['東京 資料', '東資'], ['東京', '東京'],
  ])('%s → %s', (name, initials) => {
    expect(folderInitials(name)).toBe(initials);
  });
});

it('refreshes a cached possessive badge once', async () => {
  vi.resetModules();
  const path = "/tmp/Marlowe's Café";
  let saved = JSON.stringify({ [path]: { letters: 'MS', hue: 'green' } });
  vi.stubGlobal('localStorage', { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } });
  try {
    const { folderBadgeLook: lookup } = await import('../FolderBadge');
    expect(lookup(path).letters).toBe('MC');
    vi.resetModules();
    const reloaded = await import('../FolderBadge');
    expect(reloaded.folderBadgeLook(path)).toEqual(lookup(path));
  } finally { vi.unstubAllGlobals(); }
});
