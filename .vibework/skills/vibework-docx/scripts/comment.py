"""Add comments to DOCX documents.

Usage:
    python comment.py unpacked/ 0 "Comment text"
    python comment.py unpacked/ 1 "Reply text" --parent 0

Text should be pre-escaped XML (e.g., &amp; for &, &#x2019; for smart quotes).

After running, add markers to document.xml:
  <w:commentRangeStart w:id="0"/>
  ... commented content ...
  <w:commentRangeEnd w:id="0"/>
  <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
"""

import argparse
import random
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import defusedxml.minidom

TEMPLATE_DIR = Path(__file__).parent.parent / "templates"
NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "w14": "http://schemas.microsoft.com/office/word/2010/wordml",
    "w15": "http://schemas.microsoft.com/office/word/2012/wordml",
    "w16cid": "http://schemas.microsoft.com/office/word/2016/wordml/cid",
    "w16cex": "http://schemas.microsoft.com/office/word/2018/wordml/cex",
}

# XML template for comment content in comments.xml
COMMENT_XML = """\
<w:comment w:id="{commentId}" w:author="{author}" w:date="{date}" w:initials="{initials}">
  <w:p w14:paraId="{paraId}" w14:textId="77777777">
    <w:r>
      <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
      <w:annotationRef/>
    </w:r>
    <w:r>
      <w:rPr>
        <w:color w:val="000000"/>
        <w:sz w:val="20"/>
        <w:szCs w:val="20"/>
      </w:rPr>
      <w:t>{text}</w:t>
    </w:r>
  </w:p>
</w:comment>"""

# Output templates for marker placement instructions
COMMENT_MARKER_TEMPLATE = """
Add to document.xml (markers must be direct children of w:p, never inside w:r):
  <w:commentRangeStart w:id="{commentId}"/>
  <w:r>...</w:r>
  <w:commentRangeEnd w:id="{commentId}"/>
  <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="{commentId}"/></w:r>"""

REPLY_MARKER_TEMPLATE = """
Nest markers inside parent {parentId}'s markers (markers must be direct children of w:p, never inside w:r):
  <w:commentRangeStart w:id="{parentId}"/><w:commentRangeStart w:id="{commentId}"/>
  <w:r>...</w:r>
  <w:commentRangeEnd w:id="{commentId}"/><w:commentRangeEnd w:id="{parentId}"/>
  <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="{parentId}"/></w:r>
  <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="{commentId}"/></w:r>"""


def _generateHexId() -> str:
    """Random 8-char hex ID (satisfies paraId < 0x80000000, durableId < 0x7FFFFFFF)."""
    return f"{random.randint(0, 0x7FFFFFFE):08X}"


# Smart quotes to re-encode after DOM serialization (DOM decodes entities to Unicode)
SMART_QUOTE_ENTITIES = {
    "\u201c": "&#x201C;",  # Left double quote
    "\u201d": "&#x201D;",  # Right double quote
    "\u2018": "&#x2018;",  # Left single quote
    "\u2019": "&#x2019;",  # Right single quote
}


def _encodeSmartQuotes(text: str) -> str:
    """Re-encode smart quotes as XML entities after DOM serialization."""
    for char, entity in SMART_QUOTE_ENTITIES.items():
        text = text.replace(char, entity)
    return text


def _appendXml(xmlPath: Path, rootTag: str, content: str) -> None:
    """Append content as child of root element."""
    dom = defusedxml.minidom.parseString(xmlPath.read_text(encoding="utf-8"))
    root = dom.getElementsByTagName(rootTag)[0]
    nsAttrs = " ".join(f'xmlns:{k}="{v}"' for k, v in NS.items())
    wrapperDom = defusedxml.minidom.parseString(f"<root {nsAttrs}>{content}</root>")
    for child in wrapperDom.documentElement.childNodes:
        if child.nodeType == child.ELEMENT_NODE:
            root.appendChild(dom.importNode(child, True))
    # Re-encode smart quotes that DOM decoded to Unicode
    output = _encodeSmartQuotes(dom.toxml(encoding="UTF-8").decode("utf-8"))
    xmlPath.write_text(output, encoding="utf-8")


def _findParaId(commentsPath: Path, commentId: int) -> str | None:
    """Find paraId for a comment ID."""
    dom = defusedxml.minidom.parseString(commentsPath.read_text(encoding="utf-8"))
    for c in dom.getElementsByTagName("w:comment"):
        if c.getAttribute("w:id") == str(commentId):
            for p in c.getElementsByTagName("w:p"):
                if pid := p.getAttribute("w14:paraId"):
                    return pid
    return None


def _getNextRid(relsPath: Path) -> int:
    """Get the next available rId number from document.xml.rels."""
    dom = defusedxml.minidom.parseString(relsPath.read_text(encoding="utf-8"))
    maxRid = 0
    for rel in dom.getElementsByTagName("Relationship"):
        rid = rel.getAttribute("Id")
        if rid and rid.startswith("rId"):
            try:
                maxRid = max(maxRid, int(rid[3:]))
            except ValueError:
                pass
    return maxRid + 1


def _hasRelationship(relsPath: Path, target: str) -> bool:
    """Check if a relationship with given target exists."""
    dom = defusedxml.minidom.parseString(relsPath.read_text(encoding="utf-8"))
    for rel in dom.getElementsByTagName("Relationship"):
        if rel.getAttribute("Target") == target:
            return True
    return False


def _hasContentType(ctPath: Path, partName: str) -> bool:
    """Check if a content type override with given part name exists."""
    dom = defusedxml.minidom.parseString(ctPath.read_text(encoding="utf-8"))
    for override in dom.getElementsByTagName("Override"):
        if override.getAttribute("PartName") == partName:
            return True
    return False


def _ensureCommentRelationships(unpackedDir: Path) -> None:
    """Ensure word/_rels/document.xml.rels has comment relationships."""
    relsPath = unpackedDir / "word" / "_rels" / "document.xml.rels"
    if not relsPath.exists():
        return

    if _hasRelationship(relsPath, "comments.xml"):
        return  # Already has comment relationships

    dom = defusedxml.minidom.parseString(relsPath.read_text(encoding="utf-8"))
    root = dom.documentElement
    nextRid = _getNextRid(relsPath)

    # Add relationship elements
    rels = [
        (
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
            "comments.xml",
        ),
        (
            "http://schemas.microsoft.com/office/2011/relationships/commentsExtended",
            "commentsExtended.xml",
        ),
        (
            "http://schemas.microsoft.com/office/2016/09/relationships/commentsIds",
            "commentsIds.xml",
        ),
        (
            "http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible",
            "commentsExtensible.xml",
        ),
    ]

    for relType, target in rels:
        rel = dom.createElement("Relationship")
        rel.setAttribute("Id", f"rId{nextRid}")
        rel.setAttribute("Type", relType)
        rel.setAttribute("Target", target)
        root.appendChild(rel)
        nextRid += 1

    relsPath.write_bytes(dom.toxml(encoding="UTF-8"))


def _ensureCommentContentTypes(unpackedDir: Path) -> None:
    """Ensure [Content_Types].xml has comment content types."""
    ctPath = unpackedDir / "[Content_Types].xml"
    if not ctPath.exists():
        return

    if _hasContentType(ctPath, "/word/comments.xml"):
        return  # Already has comment content types

    dom = defusedxml.minidom.parseString(ctPath.read_text(encoding="utf-8"))
    root = dom.documentElement

    # Add Override elements
    overrides = [
        (
            "/word/comments.xml",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
        ),
        (
            "/word/commentsExtended.xml",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml",
        ),
        (
            "/word/commentsIds.xml",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml",
        ),
        (
            "/word/commentsExtensible.xml",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml",
        ),
    ]

    for partName, contentType in overrides:
        override = dom.createElement("Override")
        override.setAttribute("PartName", partName)
        override.setAttribute("ContentType", contentType)
        root.appendChild(override)

    ctPath.write_bytes(dom.toxml(encoding="UTF-8"))


def addComment(
    unpackedDir: str,
    commentId: int,
    text: str,
    author: str = "Claude",
    initials: str = "C",
    parentId: int | None = None,
) -> tuple[str, str]:
    """Add comment to unpacked DOCX.

    Args:
        unpackedDir: Path to unpacked DOCX directory
        commentId: Unique comment ID
        text: Comment text, pre-escaped for XML (e.g., &amp; &#x2019;)
        author: Author name
        initials: Author initials
        parentId: Parent comment ID for replies

    Returns:
        (paraId, message) tuple.
    """
    word = Path(unpackedDir) / "word"
    if not word.exists():
        return "", f"Error: {word} not found"

    paraId, durableId = _generateHexId(), _generateHexId()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # comments.xml
    comments = word / "comments.xml"
    firstComment = not comments.exists()
    if firstComment:
        shutil.copy(TEMPLATE_DIR / "comments.xml", comments)
        # Add relationships and content types for comment files
        _ensureCommentRelationships(Path(unpackedDir))
        _ensureCommentContentTypes(Path(unpackedDir))
    _appendXml(
        comments,
        "w:comments",
        COMMENT_XML.format(
            commentId=commentId,
            author=author,
            date=ts,
            initials=initials,
            paraId=paraId,
            text=text,  # Model provides pre-escaped XML content
        ),
    )

    # commentsExtended.xml
    ext = word / "commentsExtended.xml"
    if not ext.exists():
        shutil.copy(TEMPLATE_DIR / "commentsExtended.xml", ext)
    if parentId is not None:
        parentPara = _findParaId(comments, parentId)
        if not parentPara:
            return "", f"Error: Parent comment {parentId} not found"
        _appendXml(
            ext,
            "w15:commentsEx",
            f'<w15:commentEx w15:paraId="{paraId}" w15:paraIdParent="{parentPara}" w15:done="0"/>',
        )
    else:
        _appendXml(
            ext,
            "w15:commentsEx",
            f'<w15:commentEx w15:paraId="{paraId}" w15:done="0"/>',
        )

    # commentsIds.xml
    ids = word / "commentsIds.xml"
    if not ids.exists():
        shutil.copy(TEMPLATE_DIR / "commentsIds.xml", ids)
    _appendXml(
        ids,
        "w16cid:commentsIds",
        f'<w16cid:commentId w16cid:paraId="{paraId}" w16cid:durableId="{durableId}"/>',
    )

    # commentsExtensible.xml
    extensible = word / "commentsExtensible.xml"
    if not extensible.exists():
        shutil.copy(TEMPLATE_DIR / "commentsExtensible.xml", extensible)
    _appendXml(
        extensible,
        "w16cex:commentsExtensible",
        f'<w16cex:commentExtensible w16cex:durableId="{durableId}" w16cex:dateUtc="{ts}"/>',
    )

    action = "reply" if parentId is not None else "comment"
    return paraId, f"Added {action} {commentId} (paraId={paraId})"


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Add comments to DOCX documents")
    p.add_argument("unpackedDir", help="Unpacked DOCX directory")
    p.add_argument("commentId", type=int, help="Comment ID (must be unique)")
    p.add_argument("text", help="Comment text")
    p.add_argument("--author", default="Claude", help="Author name")
    p.add_argument("--initials", default="C", help="Author initials")
    p.add_argument("--parent", type=int, help="Parent comment ID (for replies)")
    args = p.parse_args()

    paraId, msg = addComment(
        args.unpackedDir,
        args.commentId,
        args.text,
        args.author,
        args.initials,
        args.parent,
    )
    print(msg)
    if "Error" in msg:
        sys.exit(1)
    cid = args.commentId
    if args.parent is not None:
        print(REPLY_MARKER_TEMPLATE.format(parentId=args.parent, commentId=cid))
    else:
        print(COMMENT_MARKER_TEMPLATE.format(commentId=cid))
