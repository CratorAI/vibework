#!/usr/bin/env python3
"""Core utilities for vibework-pptx.

Self-contained API for unpacking, packing, and editing PPTX files.

Usage:
    from core import unpackPresentation, packPresentation, cleanWorkspace
    from core import Deck, Slide, parseXml, getTextElements
"""

import re
import shutil
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
    from .clean import clean_unused_files as _cleanUnused
else:
    from office.unpack import unpack as _unpack
    from office.pack import pack as _pack
    from clean import clean_unused_files as _cleanUnused

# Constants
DEFAULT_FONT = "Arial"
BODY_FONT = "Calibri"
SLIDE_NAMESPACE = "http://schemas.openxmlformats.org/presentationml/2006/main"
DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/main"
RELATIONSHIPS_NAMESPACE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
)

# Namespace prefixes for XPath-like queries
NAMESPACES = {
    "p": SLIDE_NAMESPACE,
    "a": DRAWING_NAMESPACE,
    "r": RELATIONSHIPS_NAMESPACE,
}


# ---------------------------------------------------------------------------
# Wrapper Functions
# ---------------------------------------------------------------------------


def unpackPresentation(
    inputFile: str, outputDirectory: str, mergeRuns: bool = False
) -> tuple[bool, str]:
    """Unpack a PPTX file for editing.

    Args:
        inputFile: Path to .pptx file
        outputDirectory: Directory to extract to
        mergeRuns: Whether to merge adjacent runs (DOCX only, ignored for PPTX)

    Returns:
        (success, message) tuple
    """
    _, message = _unpack(inputFile, outputDirectory, merge_runs=mergeRuns)
    success = "Error" not in message
    return success, message


def packPresentation(
    inputDirectory: str,
    outputFile: str,
    originalFile: Optional[str] = None,
    validate: bool = True,
) -> tuple[bool, str]:
    """Pack a directory into a PPTX file.

    Args:
        inputDirectory: Path to unpacked presentation
        outputFile: Output .pptx path
        originalFile: Original file for validation (optional)
        validate: Whether to run validation

    Returns:
        (success, message) tuple
    """
    _, message = _pack(inputDirectory, outputFile, original_file=originalFile, validate=validate)
    success = "Error" not in message
    return success, message


def cleanWorkspace(workspaceDir: str) -> list[str]:
    """Remove unreferenced files from an unpacked PPTX directory.

    Args:
        workspaceDir: Path to unpacked presentation

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
    # Get a:t elements (DrawingML text)
    for elem in dom.getElementsByTagName("a:t"):
        if elem.firstChild and elem.firstChild.nodeValue:
            texts.append(elem.firstChild.nodeValue)
    return texts


def setTextElement(element, newText: str) -> None:
    """Set the text content of a text element.

    Args:
        element: DOM element (a:t)
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
# Deck and Slide Classes
# ---------------------------------------------------------------------------


class Slide:
    """Represents a single slide in a presentation."""

    def __init__(self, filePath: Path, slideNumber: int, hidden: bool = False):
        """Initialize a Slide.

        Args:
            filePath: Path to slide XML file
            slideNumber: 1-based slide number in presentation order
            hidden: Whether slide is hidden
        """
        self.filePath = filePath
        self.slideNumber = slideNumber
        self.hidden = hidden
        self._dom: Optional[xml.dom.minidom.Document] = None

    @property
    def name(self) -> str:
        """Get slide filename (e.g., 'slide1.xml')."""
        return self.filePath.name

    @property
    def dom(self) -> xml.dom.minidom.Document:
        """Get parsed DOM (lazy-loaded)."""
        if self._dom is None:
            self._dom = parseXmlFile(str(self.filePath))
        return self._dom

    def getText(self) -> list[str]:
        """Get all text content from this slide."""
        return getTextElements(self.dom)

    def getTextContent(self) -> str:
        """Get all text as a single string."""
        return " ".join(self.getText())

    def findText(self, pattern: str) -> list[tuple[str, int]]:
        """Find text matching a pattern.

        Args:
            pattern: Regex pattern

        Returns:
            List of (matched_text, element_index) tuples
        """
        matches = []
        regex = re.compile(pattern)
        for i, text in enumerate(self.getText()):
            if regex.search(text):
                matches.append((text, i))
        return matches

    def replaceText(self, oldText: str, newText: str, count: int = -1) -> int:
        """Replace text in this slide.

        Args:
            oldText: Text to find
            newText: Replacement text
            count: Max replacements (-1 for all)

        Returns:
            Number of replacements made
        """
        replacements = 0
        for elem in self.dom.getElementsByTagName("a:t"):
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

    def save(self) -> None:
        """Save changes to the slide file."""
        if self._dom is not None:
            self.filePath.write_text(serializeXml(self._dom), encoding="utf-8")

    def reload(self) -> None:
        """Reload slide from disk."""
        self._dom = None

    def __repr__(self) -> str:
        hidden_str = " (hidden)" if self.hidden else ""
        return f"<Slide {self.slideNumber}: {self.name}{hidden_str}>"


class Deck:
    """Represents an unpacked PowerPoint presentation."""

    def __init__(self, workspaceDir: str):
        """Initialize a Deck from an unpacked workspace.

        Args:
            workspaceDir: Path to unpacked PPTX directory
        """
        self.workspaceDir = Path(workspaceDir)
        self._slides: Optional[list[Slide]] = None
        self._presentationDom: Optional[xml.dom.minidom.Document] = None

    @classmethod
    def fromFile(cls, pptxPath: str, workspaceDir: str) -> "Deck":
        """Create a Deck by unpacking a PPTX file.

        Args:
            pptxPath: Path to .pptx file
            workspaceDir: Directory to extract to

        Returns:
            Deck instance
        """
        success, message = unpackPresentation(pptxPath, workspaceDir)
        if not success:
            raise RuntimeError(f"Failed to unpack: {message}")
        return cls(workspaceDir)

    @property
    def presentationXml(self) -> Path:
        """Path to presentation.xml."""
        return self.workspaceDir / "ppt" / "presentation.xml"

    @property
    def presentationRels(self) -> Path:
        """Path to presentation.xml.rels."""
        return self.workspaceDir / "ppt" / "_rels" / "presentation.xml.rels"

    @property
    def slidesDir(self) -> Path:
        """Path to slides directory."""
        return self.workspaceDir / "ppt" / "slides"

    @property
    def presentationDom(self) -> xml.dom.minidom.Document:
        """Get parsed presentation.xml DOM."""
        if self._presentationDom is None:
            self._presentationDom = parseXmlFile(str(self.presentationXml))
        return self._presentationDom

    def _loadSlides(self) -> list[Slide]:
        """Load slides in presentation order."""
        # Read presentation.xml.rels for rId -> filename mapping
        relsDom = parseXmlFile(str(self.presentationRels))
        ridToSlide = {}
        for rel in relsDom.getElementsByTagName("Relationship"):
            rid = rel.getAttribute("Id")
            target = rel.getAttribute("Target")
            relType = rel.getAttribute("Type")
            if "slide" in relType and target.startswith("slides/"):
                ridToSlide[rid] = target.replace("slides/", "")

        # Read presentation.xml for slide order and hidden status
        slides = []
        slideNumber = 1
        for sldId in self.presentationDom.getElementsByTagName("p:sldId"):
            rid = sldId.getAttribute("r:id")
            if rid in ridToSlide:
                filename = ridToSlide[rid]
                hidden = sldId.getAttribute("show") == "0"
                filePath = self.slidesDir / filename
                if filePath.exists():
                    slides.append(Slide(filePath, slideNumber, hidden))
                    slideNumber += 1

        return slides

    @property
    def slides(self) -> list[Slide]:
        """Get all slides in presentation order."""
        if self._slides is None:
            self._slides = self._loadSlides()
        return self._slides

    @property
    def slideCount(self) -> int:
        """Get number of slides."""
        return len(self.slides)

    def getSlide(self, number: int) -> Optional[Slide]:
        """Get slide by 1-based number.

        Args:
            number: 1-based slide number

        Returns:
            Slide or None if not found
        """
        for slide in self.slides:
            if slide.slideNumber == number:
                return slide
        return None

    def getSlideByName(self, name: str) -> Optional[Slide]:
        """Get slide by filename.

        Args:
            name: Slide filename (e.g., 'slide1.xml')

        Returns:
            Slide or None if not found
        """
        for slide in self.slides:
            if slide.name == name:
                return slide
        return None

    def duplicateSlide(self, slideNumber: int) -> Slide:
        """Duplicate a slide by its 1-based number.

        Copies the slide XML, relationships, and updates all references.

        Args:
            slideNumber: 1-based slide number to duplicate

        Returns:
            New Slide object

        Raises:
            ValueError: If slide not found
            RuntimeError: If duplication fails
        """
        sourceSlide = self.getSlide(slideNumber)
        if sourceSlide is None:
            raise ValueError(f"Slide {slideNumber} not found")

        # Find the next available slide number for the filename
        existing = [
            int(m.group(1))
            for f in self.slidesDir.glob("slide*.xml")
            if (m := re.match(r"slide(\d+)\.xml", f.name))
        ]
        nextNum = max(existing) + 1 if existing else 1
        destName = f"slide{nextNum}.xml"
        destSlide = self.slidesDir / destName
        destRels = self.slidesDir / "_rels" / f"{destName}.rels"

        # Copy slide XML
        shutil.copy2(sourceSlide.filePath, destSlide)

        # Copy relationships file if exists
        sourceRels = self.slidesDir / "_rels" / f"{sourceSlide.name}.rels"
        if sourceRels.exists():
            shutil.copy2(sourceRels, destRels)

            # Remove notes references from new rels file
            relsContent = destRels.read_text(encoding="utf-8")
            relsContent = re.sub(
                r'\s*<Relationship[^>]*Type="[^"]*notesSlide"[^>]*/>\s*',
                "\n",
                relsContent,
            )
            destRels.write_text(relsContent, encoding="utf-8")

        # Add to [Content_Types].xml
        ctPath = self.workspaceDir / "[Content_Types].xml"
        ctContent = ctPath.read_text(encoding="utf-8")
        newOverride = f'<Override PartName="/ppt/slides/{destName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        if f"/ppt/slides/{destName}" not in ctContent:
            ctContent = ctContent.replace("</Types>", f"  {newOverride}\n</Types>")
            ctPath.write_text(ctContent, encoding="utf-8")

        # Add relationship to presentation.xml.rels
        presRels = self.presentationRels
        presRelsContent = presRels.read_text(encoding="utf-8")
        rids = [int(m) for m in re.findall(r'Id="rId(\d+)"', presRelsContent)]
        nextRid = max(rids) + 1 if rids else 1
        rid = f"rId{nextRid}"
        newRel = f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/{destName}"/>'
        if f"slides/{destName}" not in presRelsContent:
            presRelsContent = presRelsContent.replace(
                "</Relationships>", f"  {newRel}\n</Relationships>"
            )
            presRels.write_text(presRelsContent, encoding="utf-8")

        # Get next slide ID
        presContent = self.presentationXml.read_text(encoding="utf-8")
        slideIds = [int(m) for m in re.findall(r'<p:sldId[^>]*id="(\d+)"', presContent)]
        nextSlideId = max(slideIds) + 1 if slideIds else 256

        # Add to presentation.xml sldIdLst
        sldIdElement = f'<p:sldId id="{nextSlideId}" r:id="{rid}"/>'
        presContent = presContent.replace("</p:sldIdLst>", f"  {sldIdElement}\n  </p:sldIdLst>")
        self.presentationXml.write_text(presContent, encoding="utf-8")

        # Reload and return new slide
        self.reload()
        newSlide = self.getSlideByName(destName)
        if newSlide is None:
            raise RuntimeError(f"Failed to create slide {destName}")
        return newSlide

    def deleteSlide(self, slideNumber: int) -> None:
        """Delete a slide by its 1-based number.

        Removes the slide from presentation.xml's sldIdLst.
        The actual files are cleaned up when pack() or clean() is called.

        Args:
            slideNumber: 1-based slide number to delete

        Raises:
            ValueError: If slide not found
        """
        sourceSlide = self.getSlide(slideNumber)
        if sourceSlide is None:
            raise ValueError(f"Slide {slideNumber} not found")

        # Find the rId for this slide
        relsDom = parseXmlFile(str(self.presentationRels))
        targetRid = None
        for rel in relsDom.getElementsByTagName("Relationship"):
            target = rel.getAttribute("Target")
            if target == f"slides/{sourceSlide.name}":
                targetRid = rel.getAttribute("Id")
                break

        if targetRid is None:
            raise ValueError(f"Could not find relationship for {sourceSlide.name}")

        # Remove from presentation.xml sldIdLst
        presContent = self.presentationXml.read_text(encoding="utf-8")
        # Remove the sldId element with matching r:id
        presContent = re.sub(
            rf'\s*<p:sldId[^>]*r:id="{targetRid}"[^>]*/>\s*',
            "\n",
            presContent,
        )
        self.presentationXml.write_text(presContent, encoding="utf-8")

        # Reload slides
        self.reload()

    def getAllText(self) -> dict[int, list[str]]:
        """Get all text from all slides.

        Returns:
            Dict mapping slide number to list of text strings
        """
        return {slide.slideNumber: slide.getText() for slide in self.slides}

    def findText(self, pattern: str) -> list[tuple[Slide, str, int]]:
        """Find text matching a pattern across all slides.

        Args:
            pattern: Regex pattern

        Returns:
            List of (slide, matched_text, element_index) tuples
        """
        results = []
        for slide in self.slides:
            for text, idx in slide.findText(pattern):
                results.append((slide, text, idx))
        return results

    def replaceText(self, oldText: str, newText: str) -> int:
        """Replace text across all slides.

        Args:
            oldText: Text to find
            newText: Replacement text

        Returns:
            Total number of replacements
        """
        total = 0
        for slide in self.slides:
            total += slide.replaceText(oldText, newText)
        return total

    def saveAll(self) -> None:
        """Save all modified slides."""
        for slide in self.slides:
            slide.save()

    def reload(self) -> None:
        """Reload all slides from disk."""
        self._slides = None
        self._presentationDom = None

    def clean(self) -> list[str]:
        """Clean unreferenced files."""
        return cleanWorkspace(str(self.workspaceDir))

    def pack(
        self, outputFile: str, originalFile: Optional[str] = None, validate: bool = True
    ) -> tuple[bool, str]:
        """Pack the workspace into a PPTX file.

        Args:
            outputFile: Output .pptx path
            originalFile: Original file for validation
            validate: Whether to run validation

        Returns:
            (success, message) tuple
        """
        return packPresentation(
            str(self.workspaceDir), outputFile, originalFile, validate
        )

    def __repr__(self) -> str:
        return f"<Deck: {self.workspaceDir.name} ({self.slideCount} slides)>"


# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------


def extractSlideInfo(pptxPath: str) -> list[dict]:
    """Extract slide info from a PPTX without unpacking.

    Args:
        pptxPath: Path to .pptx file

    Returns:
        List of dicts with 'name', 'hidden', 'slideNumber' keys
    """
    slides = []
    with zipfile.ZipFile(pptxPath, "r") as zf:
        # Read rels
        relsContent = zf.read("ppt/_rels/presentation.xml.rels").decode("utf-8")
        relsDom = parseXml(relsContent)
        ridToSlide = {}
        for rel in relsDom.getElementsByTagName("Relationship"):
            rid = rel.getAttribute("Id")
            target = rel.getAttribute("Target")
            relType = rel.getAttribute("Type")
            if "slide" in relType and target.startswith("slides/"):
                ridToSlide[rid] = target.replace("slides/", "")

        # Read presentation.xml
        presContent = zf.read("ppt/presentation.xml").decode("utf-8")
        presDom = parseXml(presContent)

        slideNumber = 1
        for sldId in presDom.getElementsByTagName("p:sldId"):
            rid = sldId.getAttribute("r:id")
            if rid in ridToSlide:
                slides.append(
                    {
                        "name": ridToSlide[rid],
                        "hidden": sldId.getAttribute("show") == "0",
                        "slideNumber": slideNumber,
                    }
                )
                slideNumber += 1

    return slides


def extractAllText(pptxPath: str) -> dict[str, list[str]]:
    """Extract all text from a PPTX without unpacking.

    Args:
        pptxPath: Path to .pptx file

    Returns:
        Dict mapping slide filename to list of text strings
    """
    result = {}
    with zipfile.ZipFile(pptxPath, "r") as zf:
        for name in zf.namelist():
            if name.startswith("ppt/slides/slide") and name.endswith(".xml"):
                content = zf.read(name).decode("utf-8")
                dom = parseXml(content)
                slideName = Path(name).name
                result[slideName] = getTextElements(dom)
    return result
