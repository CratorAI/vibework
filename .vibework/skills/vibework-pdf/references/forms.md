# PDF Form Filling Guide

**CRITICAL: You MUST complete these steps in order. Do not skip ahead to writing code.**

If you need to fill out a PDF form, first check to see if the PDF has fillable form fields. Run this script from the scripts directory:
`python checkFields.py <file.pdf>`, and depending on the result go to either the "Fillable Fields" or "Non-Fillable Fields" section and follow those instructions.

---

## Fillable Fields

If the PDF has fillable form fields:

### Step 1: Extract Field Information

Run this script from the scripts directory:
```bash
python extractFormInfo.py <input.pdf> <field_info.json>
```

It will create a JSON file with a list of fields in this format:
```json
[
  {
    "field_id": "(unique ID for the field)",
    "page": 1,
    "rect": [left, bottom, right, top],
    "type": "text"
  }
]
```

**Checkboxes** have `checked_value` and `unchecked_value` properties:
```json
{
  "field_id": "checkbox_field",
  "page": 1,
  "type": "checkbox",
  "checked_value": "/On",
  "unchecked_value": "/Off"
}
```

**Radio groups** have a `radio_options` list:
```json
{
  "field_id": "radio_group",
  "page": 1,
  "type": "radio_group",
  "radio_options": [
    {"value": "/Option1", "rect": [...]},
    {"value": "/Option2", "rect": [...]}
  ]
}
```

**Multiple choice** fields have a `choice_options` list:
```json
{
  "field_id": "dropdown",
  "page": 1,
  "type": "choice",
  "choice_options": [
    {"value": "val1", "text": "Option 1"},
    {"value": "val2", "text": "Option 2"}
  ]
}
```

### Step 2: Analyze Field Purposes

Convert the PDF to images for visual analysis:
```bash
python convertToImages.py <file.pdf> <output_directory>
```

Analyze the images to determine the purpose of each form field.

### Step 3: Create Field Values

Create a `field_values.json` file with values to enter:
```json
[
  {
    "field_id": "last_name",
    "description": "The user's last name",
    "page": 1,
    "value": "Simpson"
  },
  {
    "field_id": "Checkbox12",
    "description": "Checkbox for 18 or over",
    "page": 1,
    "value": "/On"
  }
]
```

### Step 4: Fill the Form

```bash
python fillFields.py <input.pdf> <field_values.json> <output.pdf>
```

The script validates field IDs and values. Fix any errors and retry if needed.

---

## Non-Fillable Fields

If the PDF doesn't have fillable form fields, you'll add text annotations. First try to extract coordinates from the PDF structure (more accurate), then fall back to visual estimation if needed.

### Step 1: Try Structure Extraction First

Extract text labels, lines, and checkboxes with their exact PDF coordinates:
```bash
python extractStructure.py <input.pdf> form_structure.json
```

This creates a JSON file containing:
- **labels**: Every text element with exact coordinates (x0, top, x1, bottom in PDF points)
- **lines**: Horizontal lines that define row boundaries
- **checkboxes**: Small square rectangles (with center coordinates)
- **row_boundaries**: Row top/bottom positions calculated from horizontal lines

**Check the results**: If `form_structure.json` has meaningful labels, use **Approach A**. If the PDF is scanned/image-based with few labels, use **Approach B**.

---

### Approach A: Structure-Based Coordinates (Preferred)

Use this when `extractStructure.py` found text labels in the PDF.

#### A.1: Analyze the Structure

Read form_structure.json and identify:

1. **Label groups**: Adjacent text elements that form a single label
2. **Row structure**: Labels with similar `top` values are in the same row
3. **Field columns**: Entry areas start after label ends (x0 = label.x1 + gap)
4. **Checkboxes**: Use checkbox coordinates directly from the structure

**Coordinate system**: PDF coordinates where y=0 is at TOP of page, y increases downward.

#### A.2: Create fields.json with PDF Coordinates

For each field, calculate entry coordinates from the extracted structure:

**Text fields:**
- entry x0 = label x1 + 5 (small gap after label)
- entry x1 = next label's x0, or row boundary
- entry top = same as label top
- entry bottom = row boundary line below

**Checkboxes:**
- Use checkbox rectangle coordinates directly from form_structure.json

Create fields.json using `pdf_width` and `pdf_height`:
```json
{
  "pages": [
    {"page_number": 1, "pdf_width": 612, "pdf_height": 792}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "Last name entry field",
      "field_label": "Last Name",
      "label_bounding_box": [43, 63, 87, 73],
      "entry_bounding_box": [92, 63, 260, 79],
      "entry_text": {"text": "Smith", "font_size": 10}
    },
    {
      "page_number": 1,
      "description": "Yes checkbox",
      "field_label": "Yes",
      "label_bounding_box": [260, 200, 280, 210],
      "entry_bounding_box": [285, 197, 292, 205],
      "entry_text": {"text": "X"}
    }
  ]
}
```

#### A.3: Validate Bounding Boxes

Before filling, check for errors:
```bash
python checkBoundingBoxes.py fields.json
```

Fix any reported errors before proceeding.

---

### Approach B: Visual Estimation (Fallback)

Use this when the PDF is scanned/image-based.

#### B.1: Convert PDF to Images

```bash
python convertToImages.py <input.pdf> <images_dir/>
```

#### B.2: Initial Field Identification

Examine each page image to identify:
- Form field labels and approximate positions
- Entry areas (lines, boxes, or blank spaces)
- Checkboxes and their locations

#### B.3: Zoom Refinement (CRITICAL)

For each field, crop a region to refine coordinates precisely:

```bash
magick <page_image> -crop <width>x<height>+<x>+<y> +repage <crop_output.png>
```

Examine the crop to determine precise coordinates:
1. Where the entry area begins (after the label)
2. Where the entry area ends
3. Top and bottom of the entry line/box

**Convert crop coordinates back to full image:**
- full_x = crop_x + crop_offset_x
- full_y = crop_y + crop_offset_y

#### B.4: Create fields.json with Image Coordinates

Use `image_width` and `image_height` for image coordinates:
```json
{
  "pages": [
    {"page_number": 1, "image_width": 1700, "image_height": 2200}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "Last name entry field",
      "field_label": "Last Name",
      "label_bounding_box": [120, 175, 242, 198],
      "entry_bounding_box": [255, 175, 720, 218],
      "entry_text": {"text": "Smith", "font_size": 10}
    }
  ]
}
```

#### B.5: Validate Bounding Boxes

```bash
python checkBoundingBoxes.py fields.json
```

---

### Hybrid Approach: Structure + Visual

Use this when structure extraction works for most fields but misses some.

1. **Use Approach A** for detected fields
2. **Convert PDF to images** for visual analysis of missing fields
3. **Use zoom refinement** for missing fields
4. **Convert image coordinates to PDF coordinates**:
   - pdf_x = image_x * (pdf_width / image_width)
   - pdf_y = image_y * (pdf_height / image_height)
5. **Use a single coordinate system** - convert all to PDF coordinates

---

## Step 2: Fill the Form

The fill script auto-detects the coordinate system:
```bash
python fillAnnotations.py <input.pdf> fields.json <output.pdf>
```

## Step 3: Verify Output

Convert the filled PDF to images and verify:
```bash
python convertToImages.py <output.pdf> <verify_images/>
```

If text is mispositioned:
- **Approach A**: Check PDF coordinates from form_structure.json
- **Approach B**: Check image dimensions and pixel coordinates
- **Hybrid**: Ensure coordinate conversions are correct
