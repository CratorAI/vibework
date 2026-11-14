import { describe, expect, it } from "vitest";
import { completeStep, completedQuery, folderMatches, isPathLike, parentHint, tildePath } from "../folderPath";

const HOME = "/home/example";

describe("folder picker paths", () => {
  it("knows a path when it sees one", () => {
    for (const q of ["~", "~/dev", "/Users", "./src", "dev/sam"]) expect(isPathLike(q)).toBe(true);
    for (const q of ["dev", "Desktop", "sample"]) expect(isPathLike(q)).toBe(false);
  });
  it("writes the home folder as ~", () => {
    expect(tildePath("/home/example/dev/sample/", HOME)).toBe("~/dev/sample");
    expect(tildePath("/home/example", HOME)).toBe("~");
    expect(tildePath("/Volumes/x", HOME)).toBe("/Volumes/x");
    expect(tildePath("/home/exampleg/x", HOME)).toBe("/home/exampleg/x");
  });
  it("hints the parent, shortened when long", () => {
    expect(parentHint("/home/example/dev/sample", HOME)).toBe("~/dev");
    expect(parentHint("/home/example/Desktop", HOME)).toBe("~");
    expect(parentHint("/home/example/work/clients/acme/deck", HOME)).toBe("…/clients/acme");
    expect(parentHint("/tmp/vibework-slash/work/alpha", HOME)).toBe("…/work");
  });
  it("matches recents by name or anywhere in the path", () => {
    expect(folderMatches("/home/example/dev/sample-site", "sample-site", "dev/sam", HOME)).toBe(true);
    expect(folderMatches("/home/example/Desktop/vibework", "vibework", "Desktop", HOME)).toBe(true);
    expect(folderMatches("/home/example/dev/sample-site", "sample-site", "~/dev/sa", HOME)).toBe(true);
    expect(folderMatches("/home/example/dev/sample-site", "sample-site", "/HOME/EXAMPLE/dev", HOME)).toBe(true);
    expect(folderMatches("/home/example/dev/sample-site", "sample-site", "Desktop", HOME)).toBe(false);
  });
  it("completes into a folder with a trailing slash", () => {
    expect(completedQuery("/home/example/dev", HOME)).toBe("~/dev/");
    expect(completedQuery("/", HOME)).toBe("/");
  });
  it("completes one folder at a time", () => {
    expect(completeStep("/home/example/dev/vibework-v2", "~/de", HOME)).toBe("~/dev/");
    expect(completeStep("/home/example/dev/vibework-v2", "~/dev/", HOME)).toBe("~/dev/vibework-v2/");
    expect(completeStep("/home/example/dev/vibework-v2", "/home/example/d", HOME)).toBe("/home/example/dev/");
    expect(completeStep("/home/example/dev", "~/Dev", HOME)).toBe("~/dev/");
    expect(completeStep("/home/example/dev/sample", "dev/sam", HOME)).toBe("~/dev/sample/");
  });
});
