"""Session management for vibework-xlsx editing workflow.

Provides start/finish/abort workflow for editing workbooks.
Session state is stored in .vibework-session.json in the workspace.

Usage:
    python session.py start spreadsheet.xlsx workspace/
    python session.py finish workspace/ output.xlsx
    python session.py abort workspace/
    python session.py status workspace/

CLI Examples:
    # Start editing session
    python session.py start input.xlsx ./workspace

    # Make edits to workspace/xl/worksheets/sheet1.xml...

    # Finish and create output
    python session.py finish ./workspace output.xlsx

    # Or abort without saving
    python session.py abort ./workspace
"""

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Import from core (same directory)
# Relative imports when loaded as part of the package; plain ones when run directly
if __package__:
    from .core import cleanWorkspace, packWorkbook, unpackWorkbook
else:
    from core import cleanWorkspace, packWorkbook, unpackWorkbook

# Constants
SESSION_FILE = ".vibework-session.json"
SESSION_VERSION = "1.0"


class Session:
    """Represents an active editing session."""

    def __init__(
        self,
        workspaceDir: str,
        originalFile: str,
        startedAt: str,
        version: str = SESSION_VERSION,
    ):
        self.workspaceDir = Path(workspaceDir)
        self.originalFile = originalFile
        self.startedAt = startedAt
        self.version = version

    @property
    def sessionFile(self) -> Path:
        """Path to session state file."""
        return self.workspaceDir / SESSION_FILE

    def toDict(self) -> dict:
        """Serialize session to dictionary."""
        return {
            "version": self.version,
            "originalFile": self.originalFile,
            "workspaceDir": str(self.workspaceDir),
            "startedAt": self.startedAt,
        }

    def save(self) -> None:
        """Save session state to file."""
        self.sessionFile.write_text(json.dumps(self.toDict(), indent=2))

    @classmethod
    def load(cls, workspaceDir: str) -> Optional["Session"]:
        """Load session from workspace directory.

        Args:
            workspaceDir: Path to workspace

        Returns:
            Session or None if no session exists
        """
        sessionFile = Path(workspaceDir) / SESSION_FILE
        if not sessionFile.exists():
            return None

        try:
            data = json.loads(sessionFile.read_text())
            return cls(
                workspaceDir=workspaceDir,
                originalFile=data.get("originalFile", ""),
                startedAt=data.get("startedAt", ""),
                version=data.get("version", "1.0"),
            )
        except (json.JSONDecodeError, KeyError):
            return None

    def delete(self) -> None:
        """Remove session file."""
        if self.sessionFile.exists():
            self.sessionFile.unlink()


# ---------------------------------------------------------------------------
# Session Operations
# ---------------------------------------------------------------------------


def startSession(xlsxPath: str, workspaceDir: str, force: bool = False) -> Session:
    """Start a new editing session.

    Args:
        xlsxPath: Path to input .xlsx file
        workspaceDir: Directory to use as workspace
        force: If True, overwrite existing session

    Returns:
        Session object

    Raises:
        FileExistsError: If session exists and force=False
        FileNotFoundError: If xlsx file doesn't exist
        RuntimeError: If unpacking fails
    """
    xlsxPath = Path(xlsxPath).resolve()
    workspaceDir = Path(workspaceDir).resolve()

    # Validate input
    if not xlsxPath.exists():
        raise FileNotFoundError(f"Input file not found: {xlsxPath}")

    if xlsxPath.suffix.lower() not in (".xlsx", ".xlsm"):
        raise ValueError(f"Input must be a .xlsx or .xlsm file: {xlsxPath}")

    # Check for existing session
    existingSession = getSession(str(workspaceDir))
    if existingSession and not force:
        raise FileExistsError(
            f"Session already exists in {workspaceDir}. "
            f"Use force=True to overwrite or abort first."
        )

    # Clean workspace if exists
    if workspaceDir.exists():
        if force:
            shutil.rmtree(workspaceDir)
        else:
            # Check if directory is empty
            if any(workspaceDir.iterdir()):
                raise FileExistsError(f"Workspace directory not empty: {workspaceDir}")

    # Unpack workbook
    success, message = unpackWorkbook(str(xlsxPath), str(workspaceDir))
    if not success:
        raise RuntimeError(f"Failed to unpack: {message}")

    # Create session
    session = Session(
        workspaceDir=str(workspaceDir),
        originalFile=str(xlsxPath),
        startedAt=datetime.utcnow().isoformat() + "Z",
    )
    session.save()

    print(f"Session started: {workspaceDir}")
    print(f"Original file: {xlsxPath}")
    print(f"Edit files in: {workspaceDir}/xl/worksheets/")

    return session


def finishSession(
    workspaceDir: str,
    outputPath: str,
    clean: bool = True,
    validate: bool = True,
) -> tuple[bool, str]:
    """Finish an editing session and create output file.

    Args:
        workspaceDir: Path to workspace
        outputPath: Path for output .xlsx file
        clean: Whether to clean unreferenced files
        validate: Whether to run validation

    Returns:
        (success, message) tuple

    Raises:
        FileNotFoundError: If no session exists
    """
    session = getSession(workspaceDir)
    if session is None:
        raise FileNotFoundError(f"No session found in: {workspaceDir}")

    # Clean unreferenced files
    if clean:
        removed = cleanWorkspace(workspaceDir)
        if removed:
            print(f"Cleaned {len(removed)} unreferenced files")

    # Pack workbook
    success, message = packWorkbook(
        workspaceDir,
        outputPath,
        originalFile=session.originalFile,
        validate=validate,
    )

    if success:
        # Remove session file
        session.delete()
        print(f"Session finished: {outputPath}")

    return success, message


def abortSession(workspaceDir: str, removeWorkspace: bool = False) -> bool:
    """Abort an editing session without saving.

    Args:
        workspaceDir: Path to workspace
        removeWorkspace: If True, delete the workspace directory

    Returns:
        True if session was aborted

    Raises:
        FileNotFoundError: If no session exists
    """
    session = getSession(workspaceDir)
    if session is None:
        raise FileNotFoundError(f"No session found in: {workspaceDir}")

    if removeWorkspace:
        shutil.rmtree(workspaceDir)
        print(f"Session aborted and workspace removed: {workspaceDir}")
    else:
        session.delete()
        print(f"Session aborted (workspace preserved): {workspaceDir}")

    return True


def getSession(workspaceDir: str) -> Optional[Session]:
    """Get the current session for a workspace.

    Args:
        workspaceDir: Path to workspace

    Returns:
        Session or None if no session exists
    """
    return Session.load(workspaceDir)


def getSessionStatus(workspaceDir: str) -> dict:
    """Get detailed status of a session.

    Args:
        workspaceDir: Path to workspace

    Returns:
        Dict with session status info
    """
    session = getSession(workspaceDir)
    if session is None:
        return {"active": False, "workspaceDir": workspaceDir}

    workspacePath = Path(workspaceDir)
    worksheetsDir = workspacePath / "xl" / "worksheets"

    # Count sheets
    sheetCount = 0
    sheetNames = []
    if worksheetsDir.exists():
        sheetFiles = list(worksheetsDir.glob("sheet*.xml"))
        sheetCount = len(sheetFiles)
        sheetNames = [f.stem for f in sorted(sheetFiles)]

    return {
        "active": True,
        "workspaceDir": str(workspacePath),
        "originalFile": session.originalFile,
        "startedAt": session.startedAt,
        "version": session.version,
        "sheetCount": sheetCount,
        "sheets": sheetNames,
        "worksheetsDir": str(worksheetsDir) if worksheetsDir.exists() else None,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Manage vibework-xlsx editing sessions"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # start command
    startParser = subparsers.add_parser("start", help="Start new editing session")
    startParser.add_argument("input", help="Input .xlsx file")
    startParser.add_argument("workspace", help="Workspace directory")
    startParser.add_argument(
        "--force", "-f", action="store_true", help="Overwrite existing session"
    )

    # finish command
    finishParser = subparsers.add_parser("finish", help="Finish session and save")
    finishParser.add_argument("workspace", help="Workspace directory")
    finishParser.add_argument("output", help="Output .xlsx file")
    finishParser.add_argument(
        "--no-clean", action="store_true", help="Skip cleaning unreferenced files"
    )
    finishParser.add_argument(
        "--no-validate", action="store_true", help="Skip validation"
    )

    # abort command
    abortParser = subparsers.add_parser("abort", help="Abort session without saving")
    abortParser.add_argument("workspace", help="Workspace directory")
    abortParser.add_argument(
        "--remove", "-r", action="store_true", help="Also remove workspace directory"
    )

    # status command
    statusParser = subparsers.add_parser("status", help="Show session status")
    statusParser.add_argument("workspace", help="Workspace directory")

    args = parser.parse_args()

    try:
        if args.command == "start":
            startSession(args.input, args.workspace, force=args.force)

        elif args.command == "finish":
            success, message = finishSession(
                args.workspace,
                args.output,
                clean=not args.no_clean,
                validate=not args.no_validate,
            )
            print(message)
            if not success:
                sys.exit(1)

        elif args.command == "abort":
            abortSession(args.workspace, removeWorkspace=args.remove)

        elif args.command == "status":
            status = getSessionStatus(args.workspace)
            print(json.dumps(status, indent=2))

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except FileExistsError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
