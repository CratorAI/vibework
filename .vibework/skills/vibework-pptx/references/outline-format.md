# Markdown Outline Format

This document describes the Markdown format used by `fromOutline.py` to generate PowerPoint presentations.

## Basic Structure

```markdown
# Presentation Title

Optional subtitle text (first paragraph after title)

## Slide Title
- Bullet point one
- Bullet point two

## Another Slide
Paragraph content becomes body text.

> Speaker notes go in blockquotes
```

## Elements

### Title Slide

The first `#` header becomes the presentation title. The first paragraph after the title (before any `##` slide headers) becomes the subtitle.

```markdown
# Quarterly Results

A comprehensive overview of Q4 performance
```

### Content Slides

Each `##` header starts a new slide. The header text becomes the slide title.

```markdown
## Revenue Overview
```

### Bullet Points

Lines starting with `-` or `*` become bullet points.

```markdown
## Key Highlights
- Revenue up 15% year-over-year
- Customer satisfaction at all-time high
- Launched 3 new products
```

### Body Text

Non-bullet paragraphs become body text (no bullet formatting).

```markdown
## Company Mission

We believe in creating products that make people's lives easier.
Our focus is on simplicity, reliability, and user experience.
```

### Speaker Notes

Blockquotes (lines starting with `>`) become speaker notes.

```markdown
## Financial Summary
- Total revenue: $10M
- Operating margin: 25%

> Mention the impact of the new pricing strategy.
> Highlight the cost reduction initiatives.
```

## Complete Example

```markdown
# Product Launch 2024

Introducing our newest innovation

## The Problem
- Current solutions are too complex
- Users spend hours on simple tasks
- No integration between tools

> Emphasize the pain points from customer interviews

## Our Solution
- One-click automation
- Seamless integrations
- Intuitive interface

## Demo
Live demonstration of key features.

> Walk through the three main use cases

## Pricing
- Starter: $9/month
- Pro: $29/month
- Enterprise: Contact us

## Q&A
Questions and discussion.

> Have backup slides ready for technical questions
```

## Tips

1. **Keep titles short** - Slide titles should be concise (under 60 characters)
2. **Limit bullets** - 3-5 bullet points per slide for readability
3. **Use notes** - Put detailed talking points in speaker notes, not on slides
4. **Consistent structure** - Similar slides should follow the same format

## Template Selection

Use the `--template` flag to apply different visual styles:

```bash
python fromOutline.py outline.md output.pptx --template dark
```

Available templates:
- `minimal` - Clean black on white (default)
- `corporate` - Professional blue tones
- `dark` - Light text on dark background

## Custom Templates

Create a JSON file with template properties:

```json
{
  "name": "custom",
  "titleFont": "Georgia",
  "bodyFont": "Verdana",
  "titleSize": 40,
  "bodySize": 20,
  "titleColor": "2c3e50",
  "bodyColor": "34495e",
  "backgroundColor": "ecf0f1",
  "accentColor": "3498db"
}
```

Use with:

```bash
python fromOutline.py outline.md output.pptx --template /path/to/custom.json
```
