/** Small raster PDF writer: each page embeds one locally rendered JPEG. */
export interface PdfPage {
    width: number;
    height: number;
    jpeg: Uint8Array;
}
export function rasterPdf(pages: PdfPage[]): Uint8Array {
    if (!pages.length)
        throw new Error('No frames to export');
    const enc = new TextEncoder(), chunks: Uint8Array[] = [], offsets: number[] = [0];
    let length = 0;
    const put = (s: string | Uint8Array) => { const b = typeof s === 'string' ? enc.encode(s) : s; chunks.push(b); length += b.length; };
    const object = (id: number, body: string) => { offsets[id] = length; put(`${id} 0 obj\n${body}\nendobj\n`); };
    put('%PDF-1.4\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
    pages.forEach((p, i) => {
        if (!Number.isFinite(p.width) || !Number.isFinite(p.height) || p.width <= 0 || p.height <= 0)
            throw new Error('Invalid frame dimensions');
        const id = 3 + i * 3;
        object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width * .75} ${p.height * .75}] /Resources << /XObject << /Im ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
        offsets[id + 1] = length;
        put(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
        put(p.jpeg);
        put('\nendstream\nendobj\n');
        const stream = `q ${p.width * .75} 0 0 ${p.height * .75} 0 0 cm /Im Do Q`;
        object(id + 2, `<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    });
    const xref = length;
    put(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    for (const offset of offsets.slice(1))
        put(`${String(offset).padStart(10, '0')} 00000 n \n`);
    put(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(length);
    let cursor = 0;
    for (const c of chunks) {
        out.set(c, cursor);
        cursor += c.length;
    }
    return out;
}
