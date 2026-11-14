//! The first rows of a workbook's first sheet, as text, for the Artifacts
//! page thumbnail (`artifact_sheet_head`). Reads only what it needs: the zip
//! directory, the workbook and its relationships, the first rows of one sheet
//! (inflated as a stream and abandoned after them), the shared strings up to
//! the highest index those rows use, and the number formats (dates, percents).
//!
//! No spreadsheet engine: values are shown as stored. Gallery cells carry their
//! Excel number format for the frontend formatter; ranges retain simple text.

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;

/// Rows and columns returned (the gallery's tiny grid shows 6 × 5).
pub const HEAD_ROWS: usize = 6;
pub const HEAD_COLS: usize = 5;
/// Workbooks larger than this get no thumbnail.
pub const MAX_WORKBOOK_BYTES: u64 = 25 * 1024 * 1024;
/// Never inflate more than this from any one part.
const MAX_PART_BYTES: u64 = 16 * 1024 * 1024;
/// Characters kept per cell.
const MAX_CELL_CHARS: usize = 48;
/// The rows looked at before giving up on finding content.
const MAX_SCANNED_ROWS: usize = 200;

struct Entry {
    method: u16,
    compressed: u64,
    offset: u64,
}

/// A minimal reader for the zip central directory (stored and deflated
/// entries, no zip64: workbooks here are capped well below 4 GB).
struct Zip {
    file: File,
    entries: HashMap<String, Entry>,
}

fn u16le(b: &[u8], at: usize) -> u16 { u16::from_le_bytes([b[at], b[at + 1]]) }
fn u32le(b: &[u8], at: usize) -> u32 { u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]]) }

impl Zip {
    fn open(path: &Path) -> Result<Self, String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        let len = file.metadata().map_err(|e| e.to_string())?.len();
        if len > MAX_WORKBOOK_BYTES { return Err("Workbook is too large for a preview".into()); }
        // End of central directory: in the last 64 KiB + 22 bytes.
        let tail_len = len.min(65_557);
        file.seek(SeekFrom::Start(len - tail_len)).map_err(|e| e.to_string())?;
        let mut tail = vec![0; tail_len as usize];
        file.read_exact(&mut tail).map_err(|e| e.to_string())?;
        let eocd = (0..tail.len().saturating_sub(21)).rev()
            .find(|&i| u32le(&tail, i) == 0x0605_4b50)
            .ok_or("Not a zip file")?;
        let count = u16le(&tail, eocd + 10) as usize;
        let size = u32le(&tail, eocd + 12) as u64;
        let start = u32le(&tail, eocd + 16) as u64;
        if size > 4 * 1024 * 1024 || start + size > len { return Err("Unreadable zip directory".into()); }
        file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
        let mut dir = vec![0; size as usize];
        file.read_exact(&mut dir).map_err(|e| e.to_string())?;
        let mut entries = HashMap::new();
        let mut at = 0;
        for _ in 0..count {
            if at + 46 > dir.len() || u32le(&dir, at) != 0x0201_4b50 { break; }
            let method = u16le(&dir, at + 10);
            let compressed = u32le(&dir, at + 20) as u64;
            let name_len = u16le(&dir, at + 28) as usize;
            let extra_len = u16le(&dir, at + 30) as usize;
            let comment_len = u16le(&dir, at + 32) as usize;
            let offset = u32le(&dir, at + 42) as u64;
            let name_end = (at + 46 + name_len).min(dir.len());
            let name = String::from_utf8_lossy(&dir[at + 46..name_end]).trim_start_matches('/').to_string();
            entries.insert(name, Entry { method, compressed, offset });
            at += 46 + name_len + extra_len + comment_len;
        }
        Ok(Self { file, entries })
    }

    /// A streaming reader over one part's uncompressed bytes (capped).
    fn part(&self, name: &str) -> Result<Box<dyn BufRead + '_>, String> {
        let entry = self.entries.get(name).ok_or_else(|| format!("{name} is missing"))?;
        let mut file = &self.file;
        file.seek(SeekFrom::Start(entry.offset)).map_err(|e| e.to_string())?;
        let mut header = [0u8; 30];
        file.read_exact(&mut header).map_err(|e| e.to_string())?;
        if u32le(&header, 0) != 0x0403_4b50 { return Err("Bad zip entry".into()); }
        let skip = u16le(&header, 26) as i64 + u16le(&header, 28) as i64;
        file.seek(SeekFrom::Current(skip)).map_err(|e| e.to_string())?;
        let raw = file.take(entry.compressed);
        match entry.method {
            0 => Ok(Box::new(BufReader::new(raw.take(MAX_PART_BYTES)))),
            8 => Ok(Box::new(BufReader::new(flate2::read::DeflateDecoder::new(raw).take(MAX_PART_BYTES)))),
            m => Err(format!("Unsupported zip compression {m}")),
        }
    }
}

fn local(name: &[u8]) -> &[u8] {
    name.rsplit(|&b| b == b':').next().unwrap_or(name)
}

fn attr(e: &quick_xml::events::BytesStart, key: &[u8]) -> Option<String> {
    e.attributes().flatten()
        .find(|a| a.key.as_ref() == key || local(a.key.as_ref()) == key)
        .and_then(|a| a.unescape_value().ok().map(|v| v.into_owned()))
}

/// A sheet's part name ("xl/worksheets/sheet1.xml"): the first sheet, or
/// the one called `name`.
fn sheet_part(zip: &Zip, name: Option<&str>) -> Result<String, String> {
    let mut reader = Reader::from_reader(zip.part("xl/workbook.xml")?);
    let mut buf = Vec::new();
    let mut rel = None;
    loop {
        match reader.read_event_into(&mut buf).map_err(|e| e.to_string())? {
            Event::Start(e) | Event::Empty(e) if local(e.name().as_ref()) == b"sheet" => {
                if name.is_some_and(|n| attr(&e, b"name").as_deref() != Some(n)) {
                    buf.clear();
                    continue;
                }
                // r:id, whatever the prefix is called
                rel = e.attributes().flatten()
                    .find(|a| local(a.key.as_ref()) == b"id" && a.key.as_ref() != b"sheetId")
                    .and_then(|a| a.unescape_value().ok().map(|v| v.into_owned()));
                break;
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    if let (Some(name), None) = (name, &rel) { return Err(format!("Sheet “{name}” not found")); }
    let fallback = "xl/worksheets/sheet1.xml".to_string();
    let Some(rel) = rel else { return Ok(fallback) };
    let Ok(part) = zip.part("xl/_rels/workbook.xml.rels") else { return Ok(fallback) };
    let mut reader = Reader::from_reader(part);
    loop {
        match reader.read_event_into(&mut buf).map_err(|e| e.to_string())? {
            Event::Start(e) | Event::Empty(e) if local(e.name().as_ref()) == b"Relationship" => {
                if attr(&e, b"Id").as_deref() == Some(rel.as_str()) {
                    let target = attr(&e, b"Target").unwrap_or_default();
                    return Ok(match target.strip_prefix('/') {
                        Some(absolute) => absolute.to_string(),
                        None => format!("xl/{target}"),
                    });
                }
            }
            Event::Eof => return Ok(fallback),
            _ => {}
        }
        buf.clear();
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Raw {
    Shared(usize),
    Text(String),
    Number(String, usize),
    Bool(bool),
    Error(String),
}

/// Column index from a cell reference ("C7" → 2).
fn column(reference: &str) -> Option<usize> {
    let letters: String = reference.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
    if letters.is_empty() { return None; }
    Some(letters.chars().fold(0usize, |n, c| n * 26 + (c.to_ascii_uppercase() as usize - 'A' as usize + 1)) - 1)
}

/// Which rows to read: the first ones that hold anything, or rows `r1..=r2`
/// (1-based, as in "A11:B14").
#[derive(Clone, Copy)]
enum Rows { Head, Range(usize, usize) }

/// The rows wanted, each as (column, value) pairs (with its 1-based number).
fn sheet_rows(zip: &Zip, part: &str, wanted: Rows) -> Result<Vec<(usize, Vec<(usize, Raw)>)>, String> {
    let mut reader = Reader::from_reader(zip.part(part)?);
    let mut buf = Vec::new();
    let mut rows: Vec<(usize, Vec<(usize, Raw)>)> = Vec::new();
    let mut row: Vec<(usize, Raw)> = Vec::new();
    let mut row_number = 0usize;
    let mut scanned = 0;
    // The cell being read
    let mut col = 0usize;
    let mut next_col = 0usize;
    let mut kind = String::new();
    let mut style = 0usize;
    let mut value: Option<String> = None;
    let mut in_value = false;
    let mut in_inline = false;
    loop {
        match reader.read_event_into(&mut buf).map_err(|e| e.to_string())? {
            Event::Start(e) | Event::Empty(e) if local(e.name().as_ref()) == b"row" => {
                row.clear();
                next_col = 0;
                row_number = attr(&e, b"r").and_then(|r| r.parse().ok()).unwrap_or(row_number + 1);
                if let Rows::Range(_, last) = wanted {
                    if row_number > last { break; }
                }
            }
            Event::Start(e) if local(e.name().as_ref()) == b"c" => {
                col = attr(&e, b"r").as_deref().and_then(column).unwrap_or(next_col);
                next_col = col + 1;
                kind = attr(&e, b"t").unwrap_or_default();
                style = attr(&e, b"s").and_then(|s| s.parse().ok()).unwrap_or(0);
                value = None;
            }
            Event::Empty(e) if local(e.name().as_ref()) == b"c" => {
                next_col = attr(&e, b"r").as_deref().and_then(column).unwrap_or(next_col) + 1;
            }
            Event::Start(e) if local(e.name().as_ref()) == b"v" => in_value = true,
            Event::End(e) if local(e.name().as_ref()) == b"v" => in_value = false,
            Event::Start(e) if local(e.name().as_ref()) == b"is" => in_inline = true,
            Event::End(e) if local(e.name().as_ref()) == b"is" => in_inline = false,
            Event::Text(t) if in_value || in_inline => {
                let text = t.decode().map(|s| s.into_owned()).unwrap_or_default();
                let text = quick_xml::escape::unescape(&text).map(|s| s.into_owned()).unwrap_or(text);
                value.get_or_insert_with(String::new).push_str(&text);
            }
            Event::GeneralRef(r) if in_value || in_inline => {
                let name = r.decode().map(|s| s.into_owned()).unwrap_or_default();
                let ch = match name.as_str() { "amp" => "&", "lt" => "<", "gt" => ">", "quot" => "\"", "apos" => "'", _ => "" };
                value.get_or_insert_with(String::new).push_str(ch);
            }
            Event::End(e) if local(e.name().as_ref()) == b"c" => {
                if let Some(v) = value.take() {
                    let raw = match kind.as_str() {
                        "s" => v.trim().parse().map(Raw::Shared).unwrap_or(Raw::Text(v)),
                        "b" => Raw::Bool(v.trim() == "1"),
                        "e" => Raw::Error(v),
                        "str" | "inlineStr" => Raw::Text(v),
                        _ => Raw::Number(v, style),
                    };
                    row.push((col, raw));
                }
            }
            Event::End(e) if local(e.name().as_ref()) == b"row" => {
                scanned += 1;
                match wanted {
                    Rows::Head => {
                        if !row.is_empty() { rows.push((row_number, std::mem::take(&mut row))); }
                        if rows.len() >= HEAD_ROWS || scanned >= MAX_SCANNED_ROWS { break; }
                    }
                    Rows::Range(first, last) => {
                        if row_number >= first && !row.is_empty() { rows.push((row_number, std::mem::take(&mut row))); }
                        if row_number >= last { break; }
                    }
                }
            }
            Event::End(e) if local(e.name().as_ref()) == b"sheetData" => break,
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(rows)
}

/// Shared strings 0..=max (rich text runs joined).
fn shared_strings(zip: &Zip, max: usize) -> Vec<String> {
    let Ok(part) = zip.part("xl/sharedStrings.xml") else { return Vec::new() };
    let mut reader = Reader::from_reader(part);
    let mut buf = Vec::new();
    let mut out = Vec::new();
    let mut current = String::new();
    let mut in_t = false;
    let mut in_phonetic = false;
    loop {
        let Ok(event) = reader.read_event_into(&mut buf) else { break };
        match event {
            Event::Start(e) if local(e.name().as_ref()) == b"si" => current.clear(),
            Event::End(e) if local(e.name().as_ref()) == b"si" => {
                out.push(std::mem::take(&mut current));
                if out.len() > max { break; }
            }
            Event::Start(e) if local(e.name().as_ref()) == b"rPh" => in_phonetic = true,
            Event::End(e) if local(e.name().as_ref()) == b"rPh" => in_phonetic = false,
            Event::Start(e) if local(e.name().as_ref()) == b"t" => in_t = !in_phonetic,
            Event::End(e) if local(e.name().as_ref()) == b"t" => in_t = false,
            Event::Text(t) if in_t => {
                let text = t.decode().map(|s| s.into_owned()).unwrap_or_default();
                current.push_str(&quick_xml::escape::unescape(&text).map(|s| s.into_owned()).unwrap_or(text));
            }
            Event::GeneralRef(r) if in_t => {
                let name = r.decode().map(|s| s.into_owned()).unwrap_or_default();
                current.push_str(match name.as_str() { "amp" => "&", "lt" => "<", "gt" => ">", "quot" => "\"", "apos" => "'", _ => "" });
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Format { General, Date, DateTime, Time, Percent }

fn classify(id: u32, code: Option<&str>) -> Format {
    match id {
        9 | 10 => return Format::Percent,
        14..=17 => return Format::Date,
        18..=21 | 45..=47 => return Format::Time,
        22 => return Format::DateTime,
        _ => {}
    }
    let Some(code) = code else { return Format::General };
    // Drop quoted text, escapes and [colour]/[locale] blocks before looking.
    let mut plain = String::new();
    let mut quoted = false;
    let mut bracket = false;
    let mut chars = code.chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => quoted = !quoted,
            '\\' if !quoted => { chars.next(); }
            '[' if !quoted => bracket = true,
            ']' if !quoted => bracket = false,
            _ if quoted || bracket => {}
            _ => plain.push(c.to_ascii_lowercase()),
        }
    }
    let plain = plain.split(';').next().unwrap_or("");
    if plain.contains('%') { return Format::Percent; }
    let date = plain.contains('y') || plain.contains('d');
    let time = plain.contains('h') || plain.contains('s');
    match (date, time) {
        (true, true) => Format::DateTime,
        (true, false) => Format::Date,
        (false, true) => Format::Time,
        // "mm" alone is minutes after h, months otherwise; treat as a date.
        _ if plain.contains('m') && !plain.contains('0') && !plain.contains('#') => Format::Date,
        _ => Format::General,
    }
}

/// Format per cell style index (`cellXfs` order).
fn styles(zip: &Zip) -> Vec<CellFormat> {
    let Ok(part) = zip.part("xl/styles.xml") else { return Vec::new() };
    let mut reader = Reader::from_reader(part);
    let mut buf = Vec::new();
    let mut codes: HashMap<u32, String> = HashMap::new();
    let mut ids: Vec<u32> = Vec::new();
    let mut in_xfs = false;
    loop {
        let Ok(event) = reader.read_event_into(&mut buf) else { break };
        match event {
            Event::Start(e) | Event::Empty(e) if local(e.name().as_ref()) == b"numFmt" => {
                if let (Some(id), Some(code)) = (attr(&e, b"numFmtId").and_then(|v| v.parse().ok()), attr(&e, b"formatCode")) {
                    codes.insert(id, code);
                }
            }
            Event::Start(e) if local(e.name().as_ref()) == b"cellXfs" => in_xfs = true,
            Event::End(e) if local(e.name().as_ref()) == b"cellXfs" => break,
            Event::Start(e) | Event::Empty(e) if in_xfs && local(e.name().as_ref()) == b"xf" => {
                ids.push(attr(&e, b"numFmtId").and_then(|v| v.parse().ok()).unwrap_or(0));
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    ids.into_iter().map(|id| CellFormat { kind: classify(id, codes.get(&id).map(String::as_str)), id, code: codes.get(&id).cloned() }).collect()
}

/// Days since 1899-12-30 (the 1900 date system, after its leap-year bug).
fn civil_from_serial(serial: f64) -> Option<(i64, u32, u32, u32, u32)> {
    if !(0.0..2_958_466.0).contains(&serial) { return None; }
    let days = serial.floor() as i64;
    let seconds = ((serial - serial.floor()) * 86_400.0).round() as u32;
    // 1899-12-30 is day 0; convert to days since 1970-01-01 (25569).
    let z = days - 25_569 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    Some((y, m, d, seconds / 3600, (seconds % 3600) / 60))
}

fn number(text: &str, format: Format) -> String {
    let Ok(n) = text.trim().parse::<f64>() else { return text.to_string() };
    match format {
        Format::Date => civil_from_serial(n).map(|(y, m, d, _, _)| format!("{y}-{m:02}-{d:02}")),
        Format::DateTime => civil_from_serial(n).map(|(y, m, d, h, min)| format!("{y}-{m:02}-{d:02} {h:02}:{min:02}")),
        Format::Time => civil_from_serial(n).map(|(_, _, _, h, min)| format!("{h:02}:{min:02}")),
        Format::Percent => Some(format!("{}%", short(n * 100.0))),
        Format::General => None,
    }
    .unwrap_or_else(|| short(n))
}

/// Up to six significant decimals, no trailing zeros, no float noise.
fn short(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 1e15 { return format!("{}", n as i64); }
    let s = format!("{:.6}", n);
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s == "-0" { "0".into() } else { s.to_string() }
}

fn clip(text: &str) -> String {
    let one_line = text.replace(['\r', '\n', '\t'], " ");
    one_line.chars().take(MAX_CELL_CHARS).collect()
}

/// The first rows × columns of the first sheet that hold anything, starting
/// at the leftmost column in use.
pub fn head(path: &Path) -> Result<Vec<Vec<PreviewCell>>, String> {
    let zip = Zip::open(path)?;
    let sheet = sheet_part(&zip, None)?;
    let rows = sheet_rows(&zip, &sheet, Rows::Head)?;
    let text = Texts::for_rows(&zip, &rows);
    let first_col = rows.iter().flat_map(|(_, r)| r).map(|(c, _)| *c).min().unwrap_or(0);
    Ok(rows.iter().map(|(_, row)| {
        let mut out = vec![PreviewCell { text: String::new(), number: None, format: None }; HEAD_COLS];
        for (c, raw) in row {
            let Some(slot) = c.checked_sub(first_col).filter(|i| *i < HEAD_COLS) else { continue };
            out[slot] = text.preview(raw);
        }
        while out.len() > 1 && out.last().is_some_and(|c| c.text.is_empty()) { out.pop(); }
        out
    }).collect())
}

/// Most cells `range` reads (a dashboard thumbnail needs a few).
pub const MAX_RANGE_CELLS: usize = 400;

/// The cells of `sheet!r1c1:r2c2` (1-based, inclusive) as text, formatted as
/// the head is: the values the file stores (a formula's last result), no
/// spreadsheet engine. Rows and cells missing from the file are empty.
pub fn range(path: &Path, sheet: &str, r1: usize, c1: usize, r2: usize, c2: usize) -> Result<Vec<Vec<String>>, String> {
    if r1 == 0 || c1 == 0 || r2 < r1 || c2 < c1 || (r2 - r1 + 1) * (c2 - c1 + 1) > MAX_RANGE_CELLS {
        return Err("Range is empty or too large for a preview".into());
    }
    let zip = Zip::open(path)?;
    let part = sheet_part(&zip, Some(sheet))?;
    let rows = sheet_rows(&zip, &part, Rows::Range(r1, r2))?;
    let text = Texts::for_rows(&zip, &rows);
    let mut out = vec![vec![String::new(); c2 - c1 + 1]; r2 - r1 + 1];
    for (r, row) in &rows {
        let Some(line) = r.checked_sub(r1).and_then(|i| out.get_mut(i)) else { continue };
        for (c, raw) in row {
            if let Some(slot) = (c + 1).checked_sub(c1).and_then(|i| line.get_mut(i)) {
                *slot = clip(&text.of(raw));
            }
        }
    }
    Ok(out)
}

/// What turns stored values into text: the shared strings the rows use and
/// the number formats.
struct CellFormat { kind: Format, id: u32, code: Option<String> }

#[derive(Clone, serde::Serialize)]
#[serde(untagged)]
pub enum NumberFormat { Id(u32), Code(String) }

/// Stored value and its Excel format, rendered by the frontend's existing SSF
/// formatter. Keep the old text as a fallback for unsupported formats.
#[derive(Clone, serde::Serialize)]
pub struct PreviewCell {
    pub text: String,
    pub number: Option<f64>,
    pub format: Option<NumberFormat>,
}

struct Texts { strings: Vec<String>, formats: Vec<CellFormat> }

impl Texts {
    fn for_rows(zip: &Zip, rows: &[(usize, Vec<(usize, Raw)>)]) -> Self {
        let cells = || rows.iter().flat_map(|(_, r)| r);
        let max_shared = cells().filter_map(|(_, v)| match v { Raw::Shared(i) => Some(*i), _ => None }).max();
        let strings = max_shared.map(|m| shared_strings(zip, m)).unwrap_or_default();
        let formats = if cells().any(|(_, v)| matches!(v, Raw::Number(..))) { styles(zip) } else { Vec::new() };
        Self { strings, formats }
    }

    fn preview(&self, raw: &Raw) -> PreviewCell {
        let mut cell = PreviewCell { text: clip(&self.of(raw)), number: None, format: None };
        if let Raw::Number(n, s) = raw {
            if let Some(f) = self.formats.get(*s) {
                if f.id != 0 {
                    cell.number = n.trim().parse::<f64>().ok().filter(|n| n.is_finite());
                    cell.format = Some(f.code.clone().map(NumberFormat::Code).unwrap_or(NumberFormat::Id(f.id)));
                }
            }
        }
        cell
    }

    fn of(&self, raw: &Raw) -> String {
        match raw {
            Raw::Shared(i) => self.strings.get(*i).cloned().unwrap_or_default(),
            Raw::Text(t) | Raw::Error(t) => t.clone(),
            Raw::Number(n, s) => number(n, self.formats.get(*s).map(|f| f.kind).unwrap_or(Format::General)),
            Raw::Bool(b) => if *b { "TRUE".into() } else { "FALSE".into() },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/components/artifacts/sheet/__tests__/fixtures").join(name)
    }

    #[test]
    fn reads_the_first_rows_of_real_workbooks() {
        for name in ["budget.xlsx", "chart.xlsx", "extras.xlsx", "functions.xlsx", "shared.xlsx", "styled.xlsx"] {
            let rows = head(&fixture(name)).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(!rows.is_empty(), "{name} has rows");
            assert!(rows.len() <= HEAD_ROWS && rows.iter().all(|r| r.len() <= HEAD_COLS), "{name}");
            assert!(rows[0].iter().any(|c| !c.text.is_empty()), "{name}");
        }
    }

    #[test]
    fn passes_number_formats_to_the_gallery_formatter() {
        let text = Texts { strings: vec![], formats: vec![CellFormat {
            kind: Format::General, id: 164, code: Some("\"£\"#,##0".into()),
        }] };
        let cell = text.preview(&Raw::Number("29800".into(), 0));
        let json = serde_json::to_value(cell).unwrap();
        assert_eq!(json["number"], 29800.0);
        assert_eq!(json["format"], "\"£\"#,##0");
        // Actual workbook styles survive the bounded ZIP reader too.
        let rows = head(&fixture("budget.xlsx")).unwrap();
        assert!(rows.iter().flatten().any(|c| c.number.is_some() && c.format.is_some()));
    }

    #[test]
    fn formats_values_like_a_sheet() {
        assert_eq!(short(1200.0), "1200");
        assert_eq!(short(0.1 + 0.2), "0.3");
        assert_eq!(number("45597", Format::Date), "2024-11-01");
        assert_eq!(number("0.125", Format::Percent), "12.5%");
        assert_eq!(number("45597.5", Format::DateTime), "2024-11-01 12:00");
        assert_eq!(classify(164, Some("yyyy-mm-dd")), Format::Date);
        assert_eq!(classify(165, Some("\"$\"#,##0.00")), Format::General);
        assert_eq!(classify(166, Some("0.0%")), Format::Percent);
        assert_eq!(classify(167, Some("[Red]#,##0;(#,##0)")), Format::General);
        assert_eq!(column("A1"), Some(0));
        assert_eq!(column("AB12"), Some(27));
    }

    #[test]
    fn reads_a_named_sheets_range() {
        // budget.xlsx: the first sheet's first rows, read again as a range
        let rows = head(&fixture("budget.xlsx")).unwrap();
        let zip = Zip::open(&fixture("budget.xlsx")).unwrap();
        let mut reader = Reader::from_reader(zip.part("xl/workbook.xml").unwrap());
        let mut buf = Vec::new();
        let name = loop {
            match reader.read_event_into(&mut buf).unwrap() {
                Event::Start(e) | Event::Empty(e) if local(e.name().as_ref()) == b"sheet" => break attr(&e, b"name").unwrap(),
                Event::Eof => panic!("no sheet"),
                _ => {}
            }
            buf.clear();
        };
        let first = range(&fixture("budget.xlsx"), &name, 1, 1, 3, 3).unwrap();
        assert_eq!(first.len(), 3);
        assert!(first.iter().all(|r| r.len() == 3));
        assert!(first.iter().flatten().any(|c| rows.iter().flatten().any(|h| &h.text == c && !c.is_empty())), "{first:?}");
        assert!(range(&fixture("budget.xlsx"), "No such sheet", 1, 1, 2, 2).is_err());
        assert!(range(&fixture("budget.xlsx"), &name, 1, 1, 1000, 26).is_err(), "too large");
    }

    #[test]
    fn refuses_what_is_not_a_workbook() {
        let dir = std::env::temp_dir().join(format!("vibework-sheet-head-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("fake.xlsx");
        std::fs::write(&fake, b"not a zip at all").unwrap();
        assert!(head(&fake).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
