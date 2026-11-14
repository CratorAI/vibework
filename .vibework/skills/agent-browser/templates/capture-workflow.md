# Content Capture Workflow

Extract content from web pages: text, screenshots, PDFs.

## Workflow

### 1. Navigate to target

```
open https://example.com/page
wait --load networkidle
```

### 2. Get page metadata

```
get title
get url
```

### 3. Capture screenshot

```
screenshot ./page.png
screenshot --full ./page-full.png
```

### 4. Get page structure

```
snapshot -i
```

### 5. Extract text content

```
get text body
```

Or target specific elements:

```
get text @e1
get text "article"
get text "main"
get text ".content"
```

### 6. Save as PDF

```
pdf ./page.pdf
```

### 7. Handle infinite scroll pages

```
scroll down 1000
wait 1000
scroll down 1000
wait 1000
snapshot -i
screenshot --full ./page-scrolled.png
```

### 8. Cleanup

```
close
```

## Notes

- Use `--json` flag for machine-readable output
- For authenticated pages, load state first with `state load`
- Re-snapshot after scrolling to capture dynamically loaded content
