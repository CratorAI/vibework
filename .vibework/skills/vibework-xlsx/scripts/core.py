"""Core utilities for vibework-xlsx.

Self-contained API for unpacking, packing, and editing XLSX files.

Usage:
    from core import unpackWorkbook, packWorkbook, cleanWorkspace
    from core import Workbook, Sheet, parseXml, getCellValue
"""

import re
import xml.dom.minidom
import zipfile
from pathlib import Path
from typing import Optional

import defusedxml.minidom
from defusedxml.minidom import parseString as _parseString

# Local imports (self-contained)
# Relative imports when loaded as part of the package; plain ones when run directly
if __package__:
    from .clean import cleanUnusedFiles as _cleanUnused
    from .office.pack import pack as _pack
    from .office.unpack import unpack as _unpack
else:
    from clean import cleanUnusedFiles as _cleanUnused
    from office.pack import pack as _pack
    from office.unpack import unpack as _unpack

# Constants
SPREADSHEET_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
RELATIONSHIPS_NAMESPACE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
)
CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types"

# Namespace prefixes for XPath-like queries
NAMESPACES = {
    "": SPREADSHEET_NAMESPACE,
    "r": RELATIONSHIPS_NAMESPACE,
}


# ---------------------------------------------------------------------------
# Wrapper Functions
# ---------------------------------------------------------------------------


def unpackWorkbook(
    inputFile: str, outputDirectory: str, mergeRuns: bool = False
) -> tuple[bool, str]:
    """Unpack an XLSX file for editing.

    Args:
        inputFile: Path to .xlsx file
        outputDirectory: Directory to extract to
        mergeRuns: Whether to merge adjacent runs (not typically needed for xlsx)

    Returns:
        (success, message) tuple
    """
    _, message = _unpack(inputFile, outputDirectory, merge_runs=mergeRuns)
    success = "Error" not in message
    return success, message


def packWorkbook(
    inputDirectory: str,
    outputFile: str,
    originalFile: Optional[str] = None,
    validate: bool = True,
) -> tuple[bool, str]:
    """Pack a directory into an XLSX file.

    Args:
        inputDirectory: Path to unpacked workbook
        outputFile: Output .xlsx path
        originalFile: Original file for validation (optional)
        validate: Whether to run validation

    Returns:
        (success, message) tuple
    """
    _, message = _pack(
        inputDirectory, outputFile, original_file=originalFile, validate=validate
    )
    success = "Error" not in message
    return success, message


def cleanWorkspace(workspaceDir: str) -> list[str]:
    """Remove unreferenced files from an unpacked XLSX directory.

    Args:
        workspaceDir: Path to unpacked workbook

    Returns:
        List of removed file paths
    """
    return _cleanUnused(Path(workspaceDir))


# ---------------------------------------------------------------------------
# XML Helpers
# ---------------------------------------------------------------------------


def parseXml(content: str) -> xml.dom.minidom.Document:
    """Parse XML content safely.

    Args:
        content: XML string

    Returns:
        DOM document
    """
    return _parseString(content)


def parseXmlFile(filePath: str) -> xml.dom.minidom.Document:
    """Parse an XML file safely.

    Args:
        filePath: Path to XML file

    Returns:
        DOM document
    """
    content = Path(filePath).read_text(encoding="utf-8")
    return parseXml(content)


def serializeXml(dom: xml.dom.minidom.Document, prettyPrint: bool = False) -> str:
    """Serialize a DOM to XML string.

    Args:
        dom: DOM document
        prettyPrint: Whether to indent output (not recommended for xlsx)

    Returns:
        XML string
    """
    if prettyPrint:
        return dom.toprettyxml(indent="  ", encoding="utf-8").decode("utf-8")
    return dom.toxml(encoding="utf-8").decode("utf-8")


def columnToIndex(col: str) -> int:
    """Convert column letter(s) to 0-based index.

    Args:
        col: Column letter(s) like 'A', 'B', 'AA'

    Returns:
        0-based column index
    """
    result = 0
    for char in col.upper():
        result = result * 26 + (ord(char) - ord("A") + 1)
    return result - 1


def indexToColumn(index: int) -> str:
    """Convert 0-based index to column letter(s).

    Args:
        index: 0-based column index

    Returns:
        Column letter(s) like 'A', 'B', 'AA'
    """
    result = ""
    index += 1
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        result = chr(ord("A") + remainder) + result
    return result


def parseCellRef(ref: str) -> tuple[str, int]:
    """Parse cell reference into column and row.

    Args:
        ref: Cell reference like 'A1', 'B2', 'AA100'

    Returns:
        (column, row) tuple where row is 1-based
    """
    match = re.match(r"^([A-Za-z]+)(\d+)$", ref)
    if not match:
        raise ValueError(f"Invalid cell reference: {ref}")
    return match.group(1).upper(), int(match.group(2))


# ---------------------------------------------------------------------------
# Sheet Class
# ---------------------------------------------------------------------------


class Sheet:
    """Represents a single worksheet in a workbook."""

    def __init__(self, filePath: Path, name: str, index: int, sharedStrings: list[str]):
        """Initialize a Sheet.

        Args:
            filePath: Path to sheet XML file
            name: Sheet name
            index: 0-based sheet index
            sharedStrings: List of shared strings from workbook
        """
        self.filePath = filePath
        self.name = name
        self.index = index
        self._sharedStrings = sharedStrings
        self._dom: Optional[xml.dom.minidom.Document] = None
        self._modified = False

    @property
    def dom(self) -> xml.dom.minidom.Document:
        """Get parsed sheet XML DOM."""
        if self._dom is None:
            self._dom = parseXmlFile(str(self.filePath))
        return self._dom

    def _getCellElements(self) -> list:
        """Get all cell elements from the sheet."""
        return list(self.dom.getElementsByTagName("c"))

    def _getCellRef(self, cellElem) -> Optional[str]:
        """Get the cell reference (e.g., 'A1') from a cell element."""
        return cellElem.getAttribute("r") if cellElem.hasAttribute("r") else None

    def _getCellType(self, cellElem) -> Optional[str]:
        """Get the cell type attribute."""
        return cellElem.getAttribute("t") if cellElem.hasAttribute("t") else None

    def _getCellRawValue(self, cellElem) -> Optional[str]:
        """Get the raw value from a cell element."""
        for vElem in cellElem.getElementsByTagName("v"):
            if vElem.firstChild and vElem.firstChild.nodeValue:
                return vElem.firstChild.nodeValue
        return None

    def getCellValue(self, ref: str) -> Optional[str]:
        """Get the resolved value of a cell.

        Args:
            ref: Cell reference like 'A1'

        Returns:
            Cell value (resolves shared strings) or None
        """
        ref = ref.upper()
        for cellElem in self._getCellElements():
            if self._getCellRef(cellElem) == ref:
                rawValue = self._getCellRawValue(cellElem)
                if rawValue is None:
                    return None

                cellType = self._getCellType(cellElem)
                if cellType == "s":
                    # Shared string - resolve from table
                    try:
                        idx = int(rawValue)
                        if 0 <= idx < len(self._sharedStrings):
                            return self._sharedStrings[idx]
                    except (ValueError, IndexError):
                        pass
                    return rawValue
                elif cellType == "str":
                    # Inline string
                    return rawValue
                else:
                    # Number or other
                    return rawValue
        return None

    def getCell(self, ref: str) -> Optional[str]:
        """Alias for getCellValue."""
        return self.getCellValue(ref)

    def getCellFormula(self, ref: str) -> Optional[str]:
        """Get the formula of a cell if it has one.

        Args:
            ref: Cell reference like 'A1'

        Returns:
            Formula string (without leading =) or None
        """
        ref = ref.upper()
        for cellElem in self._getCellElements():
            if self._getCellRef(cellElem) == ref:
                for fElem in cellElem.getElementsByTagName("f"):
                    if fElem.firstChild and fElem.firstChild.nodeValue:
                        return fElem.firstChild.nodeValue
        return None

    @property
    def cells(self) -> dict[str, str]:
        """Get all cells as a dict mapping ref -> value."""
        result = {}
        for cellElem in self._getCellElements():
            ref = self._getCellRef(cellElem)
            if ref:
                value = self.getCellValue(ref)
                if value is not None:
                    result[ref] = value
        return result

    @property
    def rowCount(self) -> int:
        """Get number of rows with data."""
        rows = self.dom.getElementsByTagName("row")
        return len(rows)

    @property
    def usedRange(self) -> tuple[str, str]:
        """Get the used range of the sheet.

        Returns:
            (topLeft, bottomRight) cell references
        """
        cells = list(self.cells.keys())
        if not cells:
            return ("A1", "A1")

        minCol, maxCol = float("inf"), 0
        minRow, maxRow = float("inf"), 0

        for ref in cells:
            col, row = parseCellRef(ref)
            colIdx = columnToIndex(col)
            minCol = min(minCol, colIdx)
            maxCol = max(maxCol, colIdx)
            minRow = min(minRow, row)
            maxRow = max(maxRow, row)

        topLeft = f"{indexToColumn(int(minCol))}{int(minRow)}"
        bottomRight = f"{indexToColumn(int(maxCol))}{int(maxRow)}"
        return (topLeft, bottomRight)

    def findText(self, pattern: str) -> list[tuple[str, str]]:
        """Find cells containing text matching a pattern.

        Args:
            pattern: Regex pattern

        Returns:
            List of (cellRef, value) tuples
        """
        results = []
        regex = re.compile(pattern)
        for ref, value in self.cells.items():
            if regex.search(str(value)):
                results.append((ref, value))
        return results

    def replaceText(self, oldText: str, newText: str) -> int:
        """Replace text in cell values.

        Note: This only works for inline strings, not shared strings.
        For shared string replacement, use Workbook.replaceText().

        Args:
            oldText: Text to find
            newText: Replacement text

        Returns:
            Number of replacements made
        """
        replacements = 0
        for cellElem in self._getCellElements():
            cellType = self._getCellType(cellElem)

            # Only replace in inline strings (type="str") or formula results
            if cellType == "str":
                for vElem in cellElem.getElementsByTagName("v"):
                    if vElem.firstChild and vElem.firstChild.nodeValue:
                        current = vElem.firstChild.nodeValue
                        if oldText in current:
                            vElem.firstChild.nodeValue = current.replace(
                                oldText, newText
                            )
                            replacements += current.count(oldText)
                            self._modified = True

        return replacements

    def save(self) -> None:
        """Save sheet to disk."""
        if self._dom is not None and self._modified:
            self.filePath.write_text(serializeXml(self._dom), encoding="utf-8")
            self._modified = False

    def reload(self) -> None:
        """Reload sheet from disk."""
        self._dom = None
        self._modified = False

    def __repr__(self) -> str:
        return f"<Sheet {self.index}: {self.name!r} ({self.rowCount} rows)>"


# ---------------------------------------------------------------------------
# Workbook Class
# ---------------------------------------------------------------------------


class Workbook:
    """Represents an unpacked Excel workbook."""

    def __init__(self, workspaceDir: str):
        """Initialize a Workbook from an unpacked workspace.

        Args:
            workspaceDir: Path to unpacked XLSX directory
        """
        self.workspaceDir = Path(workspaceDir)
        self._sheets: Optional[list[Sheet]] = None
        self._sharedStrings: Optional[list[str]] = None
        self._sharedStringsDom: Optional[xml.dom.minidom.Document] = None
        self._sharedStringsModified = False

    @classmethod
    def fromFile(cls, xlsxPath: str, workspaceDir: str) -> "Workbook":
        """Create a Workbook by unpacking an XLSX file.

        Args:
            xlsxPath: Path to .xlsx file
            workspaceDir: Directory to extract to

        Returns:
            Workbook instance
        """
        success, message = unpackWorkbook(xlsxPath, workspaceDir)
        if not success:
            raise RuntimeError(f"Failed to unpack: {message}")
        return cls(workspaceDir)

    @property
    def workbookXml(self) -> Path:
        """Path to workbook.xml."""
        return self.workspaceDir / "xl" / "workbook.xml"

    @property
    def sharedStringsXml(self) -> Path:
        """Path to sharedStrings.xml."""
        return self.workspaceDir / "xl" / "sharedStrings.xml"

    @property
    def xlDir(self) -> Path:
        """Path to xl/ directory."""
        return self.workspaceDir / "xl"

    @property
    def worksheetsDir(self) -> Path:
        """Path to xl/worksheets/ directory."""
        return self.xlDir / "worksheets"

    def _loadSharedStrings(self) -> list[str]:
        """Load shared strings from sharedStrings.xml."""
        strings = []
        if self.sharedStringsXml.exists():
            dom = parseXmlFile(str(self.sharedStringsXml))
            self._sharedStringsDom = dom
            for siElem in dom.getElementsByTagName("si"):
                # Get text from t elements
                texts = []
                for tElem in siElem.getElementsByTagName("t"):
                    if tElem.firstChild and tElem.firstChild.nodeValue:
                        texts.append(tElem.firstChild.nodeValue)
                strings.append("".join(texts))
        return strings

    @property
    def sharedStrings(self) -> list[str]:
        """Get list of shared strings."""
        if self._sharedStrings is None:
            self._sharedStrings = self._loadSharedStrings()
        return self._sharedStrings

    def _loadSheets(self) -> list[Sheet]:
        """Load sheets from workbook.xml."""
        sheets = []
        if not self.workbookXml.exists():
            return sheets

        dom = parseXmlFile(str(self.workbookXml))

        # Get sheet names and order from workbook.xml
        sheetInfos = []
        for sheetElem in dom.getElementsByTagName("sheet"):
            name = sheetElem.getAttribute("name")
            sheetId = sheetElem.getAttribute("sheetId")
            rId = sheetElem.getAttributeNS(RELATIONSHIPS_NAMESPACE, "id")
            if not rId:
                rId = sheetElem.getAttribute("r:id")
            sheetInfos.append({"name": name, "sheetId": sheetId, "rId": rId})

        # Map rId to file path using workbook.xml.rels
        relsPath = self.xlDir / "_rels" / "workbook.xml.rels"
        rIdToFile = {}
        if relsPath.exists():
            relsDom = parseXmlFile(str(relsPath))
            for relElem in relsDom.getElementsByTagName("Relationship"):
                rId = relElem.getAttribute("Id")
                target = relElem.getAttribute("Target")
                rIdToFile[rId] = target

        # Create Sheet objects
        for idx, info in enumerate(sheetInfos):
            target = rIdToFile.get(info["rId"], f"worksheets/sheet{idx + 1}.xml")
            filePath = self.xlDir / target
            if filePath.exists():
                sheets.append(Sheet(filePath, info["name"], idx, self.sharedStrings))

        return sheets

    @property
    def sheets(self) -> list[Sheet]:
        """Get all sheets in workbook order."""
        if self._sheets is None:
            self._sheets = self._loadSheets()
        return self._sheets

    @property
    def sheetCount(self) -> int:
        """Get number of sheets."""
        return len(self.sheets)

    @property
    def sheetNames(self) -> list[str]:
        """Get list of sheet names."""
        return [s.name for s in self.sheets]

    def getSheet(self, name: str) -> Optional[Sheet]:
        """Get sheet by name.

        Args:
            name: Sheet name

        Returns:
            Sheet or None if not found
        """
        for sheet in self.sheets:
            if sheet.name == name:
                return sheet
        return None

    def getSheetByIndex(self, index: int) -> Optional[Sheet]:
        """Get sheet by 0-based index.

        Args:
            index: 0-based sheet index

        Returns:
            Sheet or None if not found
        """
        if 0 <= index < len(self.sheets):
            return self.sheets[index]
        return None

    def getAllText(self) -> dict[str, list[str]]:
        """Get all text from all sheets.

        Returns:
            Dict mapping sheet name to list of cell values
        """
        result = {}
        for sheet in self.sheets:
            result[sheet.name] = list(sheet.cells.values())
        return result

    def findText(self, pattern: str) -> list[tuple[Sheet, str, str]]:
        """Find text matching a pattern across all sheets.

        Args:
            pattern: Regex pattern

        Returns:
            List of (sheet, cellRef, value) tuples
        """
        results = []
        for sheet in self.sheets:
            for cellRef, value in sheet.findText(pattern):
                results.append((sheet, cellRef, value))
        return results

    def replaceText(self, oldText: str, newText: str) -> int:
        """Replace text across all sheets and shared strings.

        Args:
            oldText: Text to find
            newText: Replacement text

        Returns:
            Total number of replacements
        """
        total = 0

        # Replace in shared strings
        if self._sharedStringsDom is not None or self.sharedStringsXml.exists():
            if self._sharedStringsDom is None:
                self._sharedStringsDom = parseXmlFile(str(self.sharedStringsXml))

            for tElem in self._sharedStringsDom.getElementsByTagName("t"):
                if tElem.firstChild and tElem.firstChild.nodeValue:
                    current = tElem.firstChild.nodeValue
                    if oldText in current:
                        tElem.firstChild.nodeValue = current.replace(oldText, newText)
                        total += current.count(oldText)
                        self._sharedStringsModified = True

            # Reload shared strings cache
            if self._sharedStringsModified:
                self._sharedStrings = None

        # Replace in each sheet (for inline strings)
        for sheet in self.sheets:
            total += sheet.replaceText(oldText, newText)

        return total

    def saveAll(self) -> None:
        """Save all modified sheets and shared strings to disk."""
        # Save shared strings
        if self._sharedStringsDom is not None and self._sharedStringsModified:
            self.sharedStringsXml.write_text(
                serializeXml(self._sharedStringsDom), encoding="utf-8"
            )
            self._sharedStringsModified = False

        # Save sheets
        for sheet in self.sheets:
            sheet.save()

    def reload(self) -> None:
        """Reload workbook from disk."""
        self._sheets = None
        self._sharedStrings = None
        self._sharedStringsDom = None
        self._sharedStringsModified = False

    def clean(self) -> list[str]:
        """Clean unreferenced files."""
        return cleanWorkspace(str(self.workspaceDir))

    def pack(
        self, outputFile: str, originalFile: Optional[str] = None, validate: bool = True
    ) -> tuple[bool, str]:
        """Pack the workspace into an XLSX file.

        Args:
            outputFile: Output .xlsx path
            originalFile: Original file for validation
            validate: Whether to run validation

        Returns:
            (success, message) tuple
        """
        return packWorkbook(str(self.workspaceDir), outputFile, originalFile, validate)

    def __repr__(self) -> str:
        return f"<Workbook: {self.workspaceDir.name} ({self.sheetCount} sheets)>"


# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------


def extractWorkbookInfo(xlsxPath: str) -> dict:
    """Extract workbook info from an XLSX without unpacking.

    Args:
        xlsxPath: Path to .xlsx file

    Returns:
        Dict with 'sheetCount', 'sheetNames', 'totalCells', 'hasFormulas'
    """
    info = {
        "sheetCount": 0,
        "sheetNames": [],
        "totalCells": 0,
        "hasFormulas": False,
    }

    with zipfile.ZipFile(xlsxPath, "r") as zf:
        # Read workbook.xml for sheet names
        if "xl/workbook.xml" in zf.namelist():
            content = zf.read("xl/workbook.xml").decode("utf-8")
            dom = parseXml(content)
            for sheetElem in dom.getElementsByTagName("sheet"):
                name = sheetElem.getAttribute("name")
                info["sheetNames"].append(name)
            info["sheetCount"] = len(info["sheetNames"])

        # Count cells and formulas in worksheets
        for name in zf.namelist():
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
                content = zf.read(name).decode("utf-8")
                dom = parseXml(content)
                info["totalCells"] += len(dom.getElementsByTagName("c"))
                if dom.getElementsByTagName("f"):
                    info["hasFormulas"] = True

    return info


def extractAllText(xlsxPath: str) -> dict[str, list[str]]:
    """Extract all text from an XLSX without unpacking.

    Args:
        xlsxPath: Path to .xlsx file

    Returns:
        Dict mapping sheet name to list of cell values
    """
    result = {}

    with zipfile.ZipFile(xlsxPath, "r") as zf:
        # Load shared strings
        sharedStrings = []
        if "xl/sharedStrings.xml" in zf.namelist():
            content = zf.read("xl/sharedStrings.xml").decode("utf-8")
            dom = parseXml(content)
            for siElem in dom.getElementsByTagName("si"):
                texts = []
                for tElem in siElem.getElementsByTagName("t"):
                    if tElem.firstChild and tElem.firstChild.nodeValue:
                        texts.append(tElem.firstChild.nodeValue)
                sharedStrings.append("".join(texts))

        # Get sheet names
        sheetNames = []
        if "xl/workbook.xml" in zf.namelist():
            content = zf.read("xl/workbook.xml").decode("utf-8")
            dom = parseXml(content)
            for sheetElem in dom.getElementsByTagName("sheet"):
                sheetNames.append(sheetElem.getAttribute("name"))

        # Extract text from each worksheet
        for i, name in enumerate(zf.namelist()):
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
                # Try to match sheet name
                sheetIdx = i
                match = re.search(r"sheet(\d+)\.xml", name)
                if match:
                    sheetIdx = int(match.group(1)) - 1

                sheetName = (
                    sheetNames[sheetIdx]
                    if sheetIdx < len(sheetNames)
                    else f"Sheet{sheetIdx + 1}"
                )

                content = zf.read(name).decode("utf-8")
                dom = parseXml(content)

                values = []
                for cellElem in dom.getElementsByTagName("c"):
                    cellType = (
                        cellElem.getAttribute("t")
                        if cellElem.hasAttribute("t")
                        else None
                    )

                    for vElem in cellElem.getElementsByTagName("v"):
                        if vElem.firstChild and vElem.firstChild.nodeValue:
                            rawValue = vElem.firstChild.nodeValue
                            if cellType == "s":
                                try:
                                    idx = int(rawValue)
                                    if 0 <= idx < len(sharedStrings):
                                        values.append(sharedStrings[idx])
                                except (ValueError, IndexError):
                                    values.append(rawValue)
                            else:
                                values.append(rawValue)

                result[sheetName] = values

    return result
