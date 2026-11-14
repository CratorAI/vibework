"""Remove unreferenced files from an unpacked DOCX directory.

Usage: python clean.py <unpacked_dir>

Example:
    python clean.py unpacked/

This script removes:
- [trash] directory (unreferenced files)
- Orphaned .rels files for deleted resources
- Unreferenced media, embeddings, charts, diagrams files
- Content-Type overrides for deleted files
"""

import sys
from pathlib import Path

import defusedxml.minidom


def resolveTarget(unpackedDir: Path, relsFile: Path, target: str):
    """The file a relationship points at, or None (an external link).

    A target starting with "/" is a part name, relative to the package root;
    any other is relative to the folder of the part the .rels file belongs to.
    """
    if "://" in target or target.startswith("#"):
        return None
    base = unpackedDir if target.startswith("/") else relsFile.parent.parent
    return (base / target.lstrip("/")).resolve()


def getReferencedFiles(unpackedDir: Path) -> set:
    """Get all files referenced in .rels files."""
    referenced = set()

    for relsFile in unpackedDir.rglob("*.rels"):
        dom = defusedxml.minidom.parse(str(relsFile))
        for rel in dom.getElementsByTagName("Relationship"):
            target = rel.getAttribute("Target")
            if not target:
                continue
            targetPath = resolveTarget(unpackedDir, relsFile, target)
            if targetPath is None:
                continue
            try:
                referenced.add(targetPath.relative_to(unpackedDir.resolve()))
            except ValueError:
                pass

    return referenced


def removeTrashDirectory(unpackedDir: Path) -> list[str]:
    """Remove [trash] directory if it exists."""
    trashDir = unpackedDir / "[trash]"
    removed = []

    if trashDir.exists() and trashDir.is_dir():
        for filePath in trashDir.iterdir():
            if filePath.is_file():
                relPath = filePath.relative_to(unpackedDir)
                removed.append(str(relPath))
                filePath.unlink()
        trashDir.rmdir()

    return removed


def removeOrphanedRelsFiles(unpackedDir: Path) -> list[str]:
    """Remove .rels files for resources that no longer exist."""
    removed = []

    # Check word/_rels/ for orphaned relationships
    wordRelsDir = unpackedDir / "word" / "_rels"
    if wordRelsDir.exists():
        for relsFile in wordRelsDir.glob("*.rels"):
            # Skip document.xml.rels - always needed
            if relsFile.name == "document.xml.rels":
                continue
            # Check if the parent file exists
            parentFile = unpackedDir / "word" / relsFile.name.replace(".rels", "")
            if not parentFile.exists():
                relsFile.unlink()
                relPath = relsFile.relative_to(unpackedDir)
                removed.append(str(relPath))

    return removed


def removeOrphanedFiles(unpackedDir: Path, referenced: set) -> list[str]:
    """Remove files not in the referenced set."""
    resourceDirs = ["media", "embeddings", "charts", "diagrams", "glossary"]
    removed = []

    for dirName in resourceDirs:
        dirPath = unpackedDir / "word" / dirName
        if not dirPath.exists():
            continue

        for filePath in dirPath.glob("*"):
            if not filePath.is_file():
                continue
            relPath = filePath.relative_to(unpackedDir)
            if relPath not in referenced:
                filePath.unlink()
                removed.append(str(relPath))

    return removed


def updateContentTypes(unpackedDir: Path, removedFiles: list[str]) -> None:
    """Remove Content-Type overrides for deleted files."""
    ctPath = unpackedDir / "[Content_Types].xml"
    if not ctPath.exists():
        return

    dom = defusedxml.minidom.parse(str(ctPath))
    changed = False

    for override in list(dom.getElementsByTagName("Override")):
        partName = override.getAttribute("PartName").lstrip("/")
        if partName in removedFiles:
            if override.parentNode:
                override.parentNode.removeChild(override)
                changed = True

    if changed:
        with open(ctPath, "wb") as f:
            f.write(dom.toxml(encoding="utf-8"))


def cleanUnusedFiles(unpackedDir: Path) -> list[str]:
    """Remove all unreferenced files from the unpacked directory."""
    allRemoved = []

    # Remove [trash] directory
    trashRemoved = removeTrashDirectory(unpackedDir)
    allRemoved.extend(trashRemoved)

    # Keep cleaning until nothing more is removed
    while True:
        removedRels = removeOrphanedRelsFiles(unpackedDir)
        referenced = getReferencedFiles(unpackedDir)
        removedFiles = removeOrphanedFiles(unpackedDir, referenced)

        totalRemoved = removedRels + removedFiles
        if not totalRemoved:
            break

        allRemoved.extend(totalRemoved)

    if allRemoved:
        updateContentTypes(unpackedDir, allRemoved)

    return allRemoved


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python clean.py <unpacked_dir>", file=sys.stderr)
        print("Example: python clean.py unpacked/", file=sys.stderr)
        sys.exit(1)

    unpackedDir = Path(sys.argv[1])

    if not unpackedDir.exists():
        print(f"Error: {unpackedDir} not found", file=sys.stderr)
        sys.exit(1)

    removed = cleanUnusedFiles(unpackedDir)

    if removed:
        print(f"Removed {len(removed)} unreferenced files:")
        for f in removed:
            print(f"  {f}")
    else:
        print("No unreferenced files found")
