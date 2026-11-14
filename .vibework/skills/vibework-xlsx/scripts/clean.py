"""Cleanup utility for vibework-xlsx.

Removes unreferenced files from unpacked XLSX directories.

Usage:
    python clean.py ./workspace
"""

import argparse
import sys
from pathlib import Path


def cleanUnusedFiles(workspaceDir: Path) -> list[str]:
    """Remove unreferenced files from an unpacked XLSX directory.

    This function identifies and removes files that are not referenced
    in the workbook's relationship files (.rels).

    Args:
        workspaceDir: Path to unpacked XLSX directory

    Returns:
        List of removed file paths (relative to workspace)
    """
    workspaceDir = Path(workspaceDir)
    removed = []

    # XLSX files typically don't have as many orphaned files as DOCX/PPTX
    # but we can still clean up common orphans

    # Look for unreferenced media files
    mediaDir = workspaceDir / "xl" / "media"
    if mediaDir.exists():
        # Get referenced media from drawings
        referencedMedia = set()

        # Check drawing relationships
        drawingsRelsDir = workspaceDir / "xl" / "drawings" / "_rels"
        if drawingsRelsDir.exists():
            for relsFile in drawingsRelsDir.glob("*.rels"):
                content = relsFile.read_text(encoding="utf-8")
                # Simple regex to find media references
                import re

                for match in re.finditer(r'Target="[^"]*media/([^"]+)"', content):
                    referencedMedia.add(match.group(1))

        # Remove unreferenced media
        for mediaFile in mediaDir.iterdir():
            if mediaFile.is_file() and mediaFile.name not in referencedMedia:
                # Don't remove if we found no references at all (safety)
                if referencedMedia:
                    mediaFile.unlink()
                    removed.append(str(mediaFile.relative_to(workspaceDir)))

    # Clean up empty directories
    for dirPath in sorted(workspaceDir.rglob("*"), reverse=True):
        if dirPath.is_dir():
            try:
                # Only remove if empty
                if not any(dirPath.iterdir()):
                    dirPath.rmdir()
                    removed.append(str(dirPath.relative_to(workspaceDir)) + "/")
            except OSError:
                pass

    return removed


def main():
    parser = argparse.ArgumentParser(
        description="Clean unreferenced files from unpacked XLSX"
    )
    parser.add_argument("workspace", help="Path to unpacked XLSX directory")
    parser.add_argument(
        "--dry-run", "-n", action="store_true", help="Preview without removing"
    )

    args = parser.parse_args()

    workspaceDir = Path(args.workspace)
    if not workspaceDir.exists():
        print(f"Error: Directory not found: {workspaceDir}", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        print("DRY RUN - No files will be removed")
        print()

    removed = cleanUnusedFiles(workspaceDir)

    if removed:
        print(f"{'Would remove' if args.dry_run else 'Removed'} {len(removed)} files:")
        for path in removed:
            print(f"  {path}")
    else:
        print("No unreferenced files found")


if __name__ == "__main__":
    main()
