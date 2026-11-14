# PptxGenJS Reference

JavaScript library for creating PowerPoint presentations programmatically.

## Setup

```javascript
const pptxgen = require("pptxgenjs");

let presentation = new pptxgen();
presentation.layout = "LAYOUT_16x9";
presentation.author = "Author Name";
presentation.title = "Presentation Title";

let titleSlide = presentation.addSlide();
titleSlide.addText("Hello World", {
  x: 0.5, y: 2, w: 9, h: 1.5,
  fontSize: 36, fontFace: "Arial",
  color: "1E293B", bold: true,
  align: "center", valign: "middle"
});

presentation.writeFile({ fileName: "output.pptx" });
```

Run with vibework-js (Bun-compatible, on the PATH):
```bash
vibework-js run create-presentation.js
```

## Layout Dimensions

Coordinates in inches:

| Layout | Dimensions |
|--------|------------|
| `LAYOUT_16x9` | 10" x 5.625" (default) |
| `LAYOUT_16x10` | 10" x 6.25" |
| `LAYOUT_4x3` | 10" x 7.5" |
| `LAYOUT_WIDE` | 13.3" x 7.5" |

---

## Text & Formatting

### Basic Text

```javascript
currentSlide.addText("Section Title", {
  x: 0.5, y: 0.5, w: 9, h: 1,
  fontSize: 28, fontFace: "Arial",
  color: "1E293B", bold: true,
  align: "left", valign: "middle"
});
```

### Rich Text (Mixed Formatting)

```javascript
currentSlide.addText([
  { text: "Bold text ", options: { bold: true } },
  { text: "and italic", options: { italic: true } }
], { x: 0.5, y: 2, w: 9, h: 0.5, fontSize: 18 });
```

### Multi-line Text

```javascript
currentSlide.addText([
  { text: "Line 1", options: { breakLine: true } },
  { text: "Line 2", options: { breakLine: true } },
  { text: "Line 3" }
], { x: 0.5, y: 1, w: 9, h: 2, fontSize: 18 });
```

### Text Box Alignment

```javascript
// Set margin: 0 for precise alignment with shapes/icons
currentSlide.addText("Title", {
  x: 0.5, y: 0.3, w: 9, h: 0.6,
  margin: 0
});
```

---

## Lists & Bullets

### Bulleted List

```javascript
currentSlide.addText([
  { text: "First item", options: { bullet: true, breakLine: true } },
  { text: "Second item", options: { bullet: true, breakLine: true } },
  { text: "Third item", options: { bullet: true } }
], { x: 0.5, y: 1, w: 8, h: 3, fontSize: 18 });
```

### Numbered List

```javascript
currentSlide.addText([
  { text: "Step one", options: { bullet: { type: "number" }, breakLine: true } },
  { text: "Step two", options: { bullet: { type: "number" }, breakLine: true } },
  { text: "Step three", options: { bullet: { type: "number" } } }
], { x: 0.5, y: 1, w: 8, h: 3, fontSize: 18 });
```

### Nested Items

```javascript
currentSlide.addText([
  { text: "Main point", options: { bullet: true, breakLine: true } },
  { text: "Sub-point", options: { bullet: true, indentLevel: 1, breakLine: true } },
  { text: "Another main", options: { bullet: true } }
], { x: 0.5, y: 1, w: 8, h: 3 });
```

**DO:** Use `bullet: true` for bullets.
**DON'T:** Use unicode "•" characters (creates double bullets).

---

## Shapes

### Rectangle

```javascript
currentSlide.addShape(presentation.shapes.RECTANGLE, {
  x: 0.5, y: 1, w: 3, h: 2,
  fill: { color: "0EA5E9" },
  line: { color: "0284C7", width: 2 }
});
```

### Oval

```javascript
currentSlide.addShape(presentation.shapes.OVAL, {
  x: 4, y: 1, w: 2, h: 2,
  fill: { color: "10B981" }
});
```

### Line

```javascript
currentSlide.addShape(presentation.shapes.LINE, {
  x: 0.5, y: 4, w: 9, h: 0,
  line: { color: "E2E8F0", width: 1 }
});
```

### With Transparency

```javascript
currentSlide.addShape(presentation.shapes.RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2,
  fill: { color: "0EA5E9", transparency: 50 }
});
```

**Note:** Gradient fills are not supported. Use a gradient image as background instead.

---

## Images

### From File

```javascript
currentSlide.addImage({
  path: "images/chart.png",
  x: 1, y: 1, w: 5, h: 3
});
```

### From URL

```javascript
currentSlide.addImage({
  path: "https://example.com/image.jpg",
  x: 1, y: 1, w: 5, h: 3
});
```

### From Base64

```javascript
currentSlide.addImage({
  data: "image/png;base64,iVBORw0KGgo...",
  x: 1, y: 1, w: 5, h: 3
});
```

### Image Options

```javascript
currentSlide.addImage({
  path: "image.png",
  x: 1, y: 1, w: 5, h: 3,
  rotate: 45,
  rounding: true,
  transparency: 50,
  altText: "Description"
});
```

### Sizing Modes

```javascript
// Contain - fit inside, preserve ratio
{ sizing: { type: "contain", w: 4, h: 3 } }

// Cover - fill area, may crop
{ sizing: { type: "cover", w: 4, h: 3 } }
```

### Preserve Aspect Ratio

```javascript
const originalWidth = 1920;
const originalHeight = 1080;
const maxHeight = 3.0;

const calculatedWidth = maxHeight * (originalWidth / originalHeight);
const centerX = (10 - calculatedWidth) / 2;

currentSlide.addImage({
  path: "image.png",
  x: centerX, y: 1.2,
  w: calculatedWidth, h: maxHeight
});
```

**Supported formats:** PNG, JPG, GIF, SVG (modern PowerPoint only)

---

## Icons

Use react-icons with sharp for crisp icons:

```javascript
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const { FaCheckCircle } = require("react-icons/fa");

async function iconToBase64(IconComponent, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

const iconData = await iconToBase64(FaCheckCircle, "#0EA5E9", 256);
currentSlide.addImage({
  data: iconData,
  x: 1, y: 1, w: 0.5, h: 0.5
});
```

Install dependencies:
```bash
vibework-js add react react-dom sharp react-icons
```

Icon libraries: `react-icons/fa` (Font Awesome), `react-icons/md` (Material), `react-icons/hi` (Heroicons)

---

## Slide Backgrounds

### Solid Color

```javascript
currentSlide.background = { color: "F8FAFC" };
```

### Image Background

```javascript
currentSlide.background = { path: "backgrounds/gradient.jpg" };

// Or base64
currentSlide.background = { data: "image/png;base64,..." };
```

---

## Tables

### Basic Table

```javascript
currentSlide.addTable([
  ["Header 1", "Header 2", "Header 3"],
  ["Row 1 A", "Row 1 B", "Row 1 C"],
  ["Row 2 A", "Row 2 B", "Row 2 C"]
], {
  x: 0.5, y: 1, w: 9, h: 2,
  fontSize: 14,
  border: { pt: 1, color: "E2E8F0" }
});
```

### Styled Table

```javascript
const headerStyle = {
  fill: { color: "1E293B" },
  color: "FFFFFF",
  bold: true,
  align: "center"
};

const cellStyle = {
  fill: { color: "F8FAFC" },
  color: "334155",
  align: "left"
};

currentSlide.addTable([
  [
    { text: "Name", options: headerStyle },
    { text: "Value", options: headerStyle },
    { text: "Status", options: headerStyle }
  ],
  [
    { text: "Item A", options: cellStyle },
    { text: "$1,200", options: cellStyle },
    { text: "Active", options: cellStyle }
  ]
], {
  x: 0.5, y: 1, w: 9,
  colW: [3, 3, 3]
});
```

### Merged Cells

```javascript
currentSlide.addTable([
  [{ text: "Spanning Header", options: { colspan: 3, bold: true } }],
  ["A", "B", "C"]
], { x: 0.5, y: 1, w: 9 });
```

---

## Charts

### Bar Chart

```javascript
const salesData = [{
  name: "Revenue",
  labels: ["Q1", "Q2", "Q3", "Q4"],
  values: [4500, 5500, 6200, 7100]
}];

currentSlide.addChart(presentation.charts.BAR, salesData, {
  x: 0.5, y: 1, w: 9, h: 4,
  barDir: "col",
  chartColors: ["0EA5E9"],
  showValue: true,
  dataLabelPosition: "outEnd",
  dataLabelColor: "1E293B",
  catAxisLabelColor: "64748B",
  valAxisLabelColor: "64748B",
  valGridLine: { color: "E2E8F0", size: 0.5 },
  catGridLine: { style: "none" },
  showLegend: false
});
```

### Line Chart

```javascript
const trendData = [{
  name: "Users",
  labels: ["Jan", "Feb", "Mar", "Apr", "May"],
  values: [120, 145, 168, 192, 230]
}];

currentSlide.addChart(presentation.charts.LINE, trendData, {
  x: 0.5, y: 1, w: 9, h: 4,
  lineSize: 3,
  lineSmooth: true,
  chartColors: ["10B981"],
  showValue: false,
  catAxisLabelColor: "64748B",
  valAxisLabelColor: "64748B",
  valGridLine: { color: "E2E8F0", size: 0.5 },
  catGridLine: { style: "none" }
});
```

### Pie Chart

```javascript
const shareData = [{
  name: "Market Share",
  labels: ["Product A", "Product B", "Other"],
  values: [45, 35, 20]
}];

currentSlide.addChart(presentation.charts.PIE, shareData, {
  x: 3, y: 1, w: 4, h: 4,
  showPercent: true,
  chartColors: ["0EA5E9", "10B981", "F59E0B"],
  showLegend: true,
  legendPos: "b"
});
```

### Chart Styling Options

| Option | Description |
|--------|-------------|
| `chartColors` | Array of hex colors for series |
| `showValue` | Display data labels |
| `dataLabelPosition` | "outEnd", "inEnd", "center" |
| `valGridLine` | `{ color, size }` or `{ style: "none" }` |
| `catGridLine` | Same as valGridLine |
| `lineSmooth` | Curved lines (line charts) |
| `legendPos` | "b", "t", "l", "r", "tr" |

### Better-Looking Charts

Default charts look dated. Apply these options for a modern, clean appearance:

```javascript
currentSlide.addChart(presentation.charts.BAR, chartData, {
  x: 0.5, y: 1, w: 9, h: 4,
  barDir: "col",

  // Custom colors (match your presentation palette)
  chartColors: ["0EA5E9", "10B981", "F59E0B"],

  // Clean background
  chartArea: { fill: { color: "FFFFFF" }, roundedCorners: true },

  // Muted axis labels
  catAxisLabelColor: "64748B",
  valAxisLabelColor: "64748B",

  // Subtle grid (value axis only)
  valGridLine: { color: "E2E8F0", size: 0.5 },
  catGridLine: { style: "none" },

  // Data labels on bars
  showValue: true,
  dataLabelPosition: "outEnd",
  dataLabelColor: "1E293B",

  // Hide legend for single series
  showLegend: false,
});
```

**Key principles:**
- `chartColors` should match your presentation palette, not default blue
- `chartArea` with white fill and rounded corners looks modern
- Hide category grid lines (`catGridLine: { style: "none" }`) for cleaner look
- Muted axis label colors (`64748B`) don't compete with data
- `lineSmooth: true` for line charts creates elegant curves
- Hide legend (`showLegend: false`) for single-series charts

---

## Slide Masters

```javascript
presentation.defineSlideMaster({
  title: "TITLE_SLIDE",
  background: { color: "1E293B" },
  objects: [{
    placeholder: {
      options: {
        name: "title",
        type: "title",
        x: 0.5, y: 2, w: 9, h: 1.5
      }
    }
  }]
});

let titleSlide = presentation.addSlide({ masterName: "TITLE_SLIDE" });
titleSlide.addText("Presentation Title", { placeholder: "title", color: "FFFFFF" });
```

---

## Common Pitfalls

| Issue | DO | DON'T |
|-------|------|-------|
| Hex colors | `color: "FF0000"` | `color: "#FF0000"` |
| Bullets | `bullet: true` | `"• Item"` |
| Line breaks | `breakLine: true` | `\n` |
| Bullet spacing | `paraSpaceAfter: 6` | `lineSpacing: 200` |
| Card borders | Use `RECTANGLE` | Use `ROUNDED_RECTANGLE` with overlay |
| Instances | Create new `pptxgen()` | Reuse presentation objects |

---

## Quick Reference

**Shapes:** `RECTANGLE`, `OVAL`, `LINE`

**Charts:** `BAR`, `LINE`, `PIE`, `DOUGHNUT`, `SCATTER`

**Layouts:** `LAYOUT_16x9` (10" x 5.625"), `LAYOUT_4x3`, `LAYOUT_WIDE`

**Alignment:** `"left"`, `"center"`, `"right"` / `"top"`, `"middle"`, `"bottom"`

**Color Palette (Tailwind):**
- Slate: `1E293B` (dark), `64748B` (muted), `F8FAFC` (light)
- Blue: `0EA5E9`, `0284C7`
- Green: `10B981`, `059669`
- Amber: `F59E0B`, `D97706`
