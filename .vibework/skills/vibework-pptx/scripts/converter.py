"""Local LibreOffice conversion. Documents never leave this machine."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

TIMEOUT = 120
MISSING_MESSAGE = (
    "LibreOffice is not installed. On macOS run: brew install --cask libreoffice; "
    "or download it for your platform from https://www.libreoffice.org/download/download-libreoffice/. "
    "PDF export requires LibreOffice; optional visual checks can be skipped."
)

class LibreOfficeNotInstalled(RuntimeError):
    pass

def find_soffice() -> str:
    candidates = [shutil.which("soffice"), shutil.which("libreoffice"),
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        str(Path.home() / "Applications/LibreOffice.app/Contents/MacOS/soffice"),
        "/usr/bin/soffice", "/usr/bin/libreoffice", "/usr/local/bin/soffice",
        "/opt/libreoffice/program/soffice", "/snap/bin/libreoffice"]
    for env, default in [("PROGRAMFILES", "C:/Program Files"),
                         ("PROGRAMFILES(X86)", "C:/Program Files (x86)"),
                         ("LOCALAPPDATA", "C:/Users/Default/AppData/Local")]:
        candidates.append(str(Path(os.environ.get(env, default)) / "LibreOffice/program/soffice.exe"))
    for candidate in candidates:
        # is_file follows symlinks: a dangling Homebrew symlink is not an installation.
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            try:
                probe = subprocess.run([str(candidate), "--version"], capture_output=True,
                                       text=True, timeout=10)
                if probe.returncode == 0:
                    return str(Path(candidate).absolute())
            except (OSError, subprocess.TimeoutExpired):
                continue
    raise LibreOfficeNotInstalled(MISSING_MESSAGE)

def convert_to_pdf(file_path: Path) -> bytes:
    source = Path(file_path).resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Document not found: {source}")
    executable = find_soffice()
    with tempfile.TemporaryDirectory(prefix="vibework-pdf-") as temp:
        root = Path(temp)
        output = root / "output"
        output.mkdir()
        command = [executable, f"-env:UserInstallation={(root / 'profile').as_uri()}",
                   "--headless", "--convert-to", "pdf", "--outdir", str(output), str(source)]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=TIMEOUT)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"LibreOffice PDF conversion timed out after {TIMEOUT} seconds.") from exc
        except OSError as exc:
            raise RuntimeError(f"Could not start LibreOffice: {exc}") from exc
        pdf = output / (source.stem + ".pdf")
        if result.returncode != 0 or not pdf.is_file():
            detail = (result.stderr or result.stdout).strip()[-2000:]
            raise RuntimeError(f"LibreOffice failed to produce a PDF (exit {result.returncode}): {detail}")
        data = pdf.read_bytes()
        if not data.startswith(b"%PDF-"):
            raise RuntimeError("LibreOffice produced an invalid PDF.")
        return data

def convertPptxToPdf(filePath: Path) -> bytes:
    return convert_to_pdf(filePath)


def pdfToImages(
    pdfBytes: bytes, dpi: int = 150, imageFormat: str = "png"
) -> list[bytes]:
    """Convert PDF bytes to list of image bytes using PyMuPDF.

    Args:
        pdfBytes: PDF file contents as bytes
        dpi: Image resolution (dots per inch)
        imageFormat: Output format (png, jpeg, etc.)

    Returns:
        List of image bytes, one per page
    """
    import pymupdf

    doc = pymupdf.open(stream=pdfBytes, filetype="pdf")
    images = []
    for page in doc:
        pix = page.get_pixmap(dpi=dpi)
        images.append(pix.tobytes(imageFormat))
    doc.close()
    return images
