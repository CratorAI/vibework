"""Core utilities for vibework-docx.

Self-contained API for unpacking, packing, and editing DOCX files.

Usage:
    from core import unpackDocument, packDocument, cleanWorkspace
    from core import Document, Paragraph, parseXml, getTextElements
"""

import re
import zipfile
from pathlib import Path
from typing import Optional

import xml.dom.minidom
import defusedxml.minidom
from defusedxml.minidom import parseString as _parseString

# Local imports (self-contained)
# Relative imports when loaded as part of the package; plain ones when run directly
if __package__:
    from .office.unpack import unpack as _unpack
    from .office.pack import pack as _pack
    from .clean import cleanUnusedFiles as _cleanUnused
else:
    from office.unpack import unpack as _unpack
    from office.pack import pack as _pack
    from clean import cleanUnusedFiles as _cleanUnused

# Constants
DEFAULT_FONT = "Calibri"
WORDPROCESSING_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
RELATIONSHIPS_NAMESPACE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
)

# Namespace prefixes for XPath-like queries
NAMESPACES = {
    "w": WORDPROCESSING_NAMESPACE,
    "r": RELATIONSHIPS_NAMESPACE,
}


# ---------------------------------------------------------------------------
# Wrapper Functions
# ---------------------------------------------------------------------------


def unpackDocument(
    inputFile: str, outputDirectory: str, mergeRuns: bool = True
) -> tuple[bool, str]:
    """Unpack a DOCX file for editing.

    Args:
        inputFile: Path to .docx file
        outputDirectory: Directory to extract to
        mergeRuns: Whether to merge adjacent runs with same formatting

    Returns:
        (success, message) tuple
    """
    _, message = _unpack(inputFile, outputDirectory, merge_runs=mergeRuns)
    success = "Error" not in message
    return success, message


def packDocument(
    inputDirectory: str,
    outputFile: str,
    originalFile: Optional[str] = None,
    validate: bool = True,
) -> tuple[bool, str]:
    """Pack a directory into a DOCX file.

    Args:
        inputDirectory: Path to unpacked document
        outputFile: Output .docx path
        originalFile: Original file for validation (optional)
        validate: Whether to run validation

    Returns:
        (success, message) tuple
    """
    _, message = _pack(inputDirectory, outputFile, original_file=originalFile, validate=validate)
    success = "Error" not in message
    return success, message


def cleanWorkspace(workspaceDir: str) -> list[str]:
    """Remove unreferenced files from an unpacked DOCX directory.

    Args:
        workspaceDir: Path to unpacked document

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


def getTextElements(dom: xml.dom.minidom.Document) -> list[str]:
    """Extract all text content from a DOM.

    Args:
        dom: Parsed XML document

    Returns:
        List of text strings
    """
    texts = []
    # Get w:t elements (WordprocessingML text)
    for elem in dom.getElementsByTagName("w:t"):
        if elem.firstChild and elem.firstChild.nodeValue:
            texts.append(elem.firstChild.nodeValue)
    return texts


def setTextElement(element, newText: str) -> None:
    """Set the text content of a text element.

    Args:
        element: DOM element (w:t)
        newText: New text content
    """
    if element.firstChild:
        element.firstChild.nodeValue = newText
    else:
        textNode = element.ownerDocument.createTextNode(newText)
        element.appendChild(textNode)


def serializeXml(dom: xml.dom.minidom.Document, prettyPrint: bool = True) -> str:
    """Serialize a DOM to XML string.

    Args:
        dom: DOM document
        prettyPrint: Whether to indent output

    Returns:
        XML string
    """
    if prettyPrint:
        return dom.toprettyxml(indent="  ", encoding="utf-8").decode("utf-8")
    return dom.toxml(encoding="utf-8").decode("utf-8")


# ---------------------------------------------------------------------------
# Paragraph and Document Classes
# ---------------------------------------------------------------------------


class Paragraph:
    """Represents a single paragraph in a document."""

    def __init__(self, element, index: int):
        """Initialize a Paragraph.

        Args:
            element: DOM element (w:p)
            index: 0-based paragraph index
        """
        self.element = element
        self.index = index

    @property
    def text(self) -> str:
        """Get the text content of this paragraph."""
        texts = []
        for elem in self.element.getElementsByTagName("w:t"):
            if elem.firstChild and elem.firstChild.nodeValue:
                texts.append(elem.firstChild.nodeValue)
        return "".join(texts)

    @property
    def style(self) -> Optional[str]:
        """Get the paragraph style (e.g., 'Heading1')."""
        for pPr in self.element.getElementsByTagName("w:pPr"):
            for pStyle in pPr.getElementsByTagName("w:pStyle"):
                return pStyle.getAttribute("w:val")
        return None

    def getRuns(self) -> list:
        """Get all runs in this paragraph."""
        return list(self.element.getElementsByTagName("w:r"))

    def replaceText(self, oldText: str, newText: str, count: int = -1) -> int:
        """Replace text in this paragraph.

        Args:
            oldText: Text to find
            newText: Replacement text
            count: Max replacements (-1 for all)

        Returns:
            Number of replacements made
        """
        replacements = 0
        for elem in self.element.getElementsByTagName("w:t"):
            if elem.firstChild and elem.firstChild.nodeValue:
                current = elem.firstChild.nodeValue
                if oldText in current:
                    if count == -1:
                        elem.firstChild.nodeValue = current.replace(oldText, newText)
                        replacements += current.count(oldText)
                    elif replacements < count:
                        remaining = count - replacements
                        elem.firstChild.nodeValue = current.replace(
                            oldText, newText, remaining
                        )
                        replacements += min(current.count(oldText), remaining)
        return replacements

    def __repr__(self) -> str:
        styleStr = f" ({self.style})" if self.style else ""
        preview = self.text[:50] + "..." if len(self.text) > 50 else self.text
        return f"<Paragraph {self.index}{styleStr}: {preview!r}>"


class Document:
    """Represents an unpacked Word document."""

    def __init__(self, workspaceDir: str):
        """Initialize a Document from an unpacked workspace.

        Args:
            workspaceDir: Path to unpacked DOCX directory
        """
        self.workspaceDir = Path(workspaceDir)
        self._documentDom: Optional[xml.dom.minidom.Document] = None
        self._paragraphs: Optional[list[Paragraph]] = None

    @classmethod
    def fromFile(cls, docxPath: str, workspaceDir: str) -> "Document":
        """Create a Document by unpacking a DOCX file.

        Args:
            docxPath: Path to .docx file
            workspaceDir: Directory to extract to

        Returns:
            Document instance
        """
        success, message = unpackDocument(docxPath, workspaceDir)
        if not success:
            raise RuntimeError(f"Failed to unpack: {message}")
        return cls(workspaceDir)

    @property
    def documentXml(self) -> Path:
        """Path to document.xml."""
        return self.workspaceDir / "word" / "document.xml"

    @property
    def documentRels(self) -> Path:
        """Path to document.xml.rels."""
        return self.workspaceDir / "word" / "_rels" / "document.xml.rels"

    @property
    def wordDir(self) -> Path:
        """Path to word/ directory."""
        return self.workspaceDir / "word"

    @property
    def documentDom(self) -> xml.dom.minidom.Document:
        """Get parsed document.xml DOM."""
        if self._documentDom is None:
            self._documentDom = parseXmlFile(str(self.documentXml))
        return self._documentDom

    def _loadParagraphs(self) -> list[Paragraph]:
        """Load paragraphs from document.xml."""
        paragraphs = []
        for i, pElem in enumerate(self.documentDom.getElementsByTagName("w:p")):
            paragraphs.append(Paragraph(pElem, i))
        return paragraphs

    @property
    def paragraphs(self) -> list[Paragraph]:
        """Get all paragraphs in document order."""
        if self._paragraphs is None:
            self._paragraphs = self._loadParagraphs()
        return self._paragraphs

    @property
    def paragraphCount(self) -> int:
        """Get number of paragraphs."""
        return len(self.paragraphs)

    def getParagraph(self, index: int) -> Optional[Paragraph]:
        """Get paragraph by 0-based index.

        Args:
            index: 0-based paragraph index

        Returns:
            Paragraph or None if not found
        """
        if 0 <= index < len(self.paragraphs):
            return self.paragraphs[index]
        return None

    def getAllText(self) -> list[str]:
        """Get all text from all paragraphs.

        Returns:
            List of paragraph texts
        """
        return [p.text for p in self.paragraphs]

    def getFullText(self) -> str:
        """Get all text as a single string with newlines.

        Returns:
            Full document text
        """
        return "\n".join(self.getAllText())

    def findText(self, pattern: str) -> list[tuple[Paragraph, str]]:
        """Find text matching a pattern across all paragraphs.

        Args:
            pattern: Regex pattern

        Returns:
            List of (paragraph, matched_text) tuples
        """
        results = []
        regex = re.compile(pattern)
        for para in self.paragraphs:
            for match in regex.findall(para.text):
                results.append((para, match))
        return results

    def replaceText(self, oldText: str, newText: str) -> int:
        """Replace text across all paragraphs.

        Args:
            oldText: Text to find
            newText: Replacement text

        Returns:
            Total number of replacements
        """
        total = 0
        for para in self.paragraphs:
            total += para.replaceText(oldText, newText)
        return total

    def saveAll(self) -> None:
        """Save document.xml to disk."""
        if self._documentDom is not None:
            self.documentXml.write_text(serializeXml(self._documentDom), encoding="utf-8")

    def reload(self) -> None:
        """Reload document from disk."""
        self._documentDom = None
        self._paragraphs = None

    def clean(self) -> list[str]:
        """Clean unreferenced files."""
        return cleanWorkspace(str(self.workspaceDir))

    def pack(
        self, outputFile: str, originalFile: Optional[str] = None, validate: bool = True
    ) -> tuple[bool, str]:
        """Pack the workspace into a DOCX file.

        Args:
            outputFile: Output .docx path
            originalFile: Original file for validation
            validate: Whether to run validation

        Returns:
            (success, message) tuple
        """
        return packDocument(
            str(self.workspaceDir), outputFile, originalFile, validate
        )

    def hasTrackedChanges(self) -> bool:
        """Check if document has tracked changes."""
        dom = self.documentDom
        return (
            len(dom.getElementsByTagName("w:ins")) > 0 or
            len(dom.getElementsByTagName("w:del")) > 0
        )

    def hasComments(self) -> bool:
        """Check if document has comments."""
        commentsPath = self.wordDir / "comments.xml"
        return commentsPath.exists()

    def __repr__(self) -> str:
        return f"<Document: {self.workspaceDir.name} ({self.paragraphCount} paragraphs)>"


# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------


def extractDocumentInfo(docxPath: str) -> dict:
    """Extract document info from a DOCX without unpacking.

    Args:
        docxPath: Path to .docx file

    Returns:
        Dict with 'paragraphCount', 'wordCount', 'hasTrackedChanges', 'hasComments'
    """
    info = {
        "paragraphCount": 0,
        "wordCount": 0,
        "hasTrackedChanges": False,
        "hasComments": False,
    }

    with zipfile.ZipFile(docxPath, "r") as zf:
        # Read document.xml
        if "word/document.xml" in zf.namelist():
            content = zf.read("word/document.xml").decode("utf-8")
            dom = parseXml(content)

            # Count paragraphs
            info["paragraphCount"] = len(dom.getElementsByTagName("w:p"))

            # Count words
            texts = getTextElements(dom)
            allText = " ".join(texts)
            info["wordCount"] = len(allText.split()) if allText else 0

            # Check for tracked changes
            info["hasTrackedChanges"] = (
                len(dom.getElementsByTagName("w:ins")) > 0 or
                len(dom.getElementsByTagName("w:del")) > 0
            )

        # Check for comments
        info["hasComments"] = "word/comments.xml" in zf.namelist()

    return info


def extractAllText(docxPath: str) -> str:
    """Extract all text from a DOCX without unpacking.

    Args:
        docxPath: Path to .docx file

    Returns:
        Full document text
    """
    with zipfile.ZipFile(docxPath, "r") as zf:
        if "word/document.xml" in zf.namelist():
            content = zf.read("word/document.xml").decode("utf-8")
            dom = parseXml(content)
            texts = getTextElements(dom)
            return " ".join(texts)
    return ""
