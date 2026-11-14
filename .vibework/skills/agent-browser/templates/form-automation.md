# Form Automation Workflow

Fill and submit web forms with validation.

## Workflow

### 1. Navigate to form

```
open https://example.com/form
wait --load networkidle
```

### 2. Analyze form structure

```
snapshot -i
```

Identify refs for each field type.

### 3. Fill fields by type

**Text inputs:**
```
fill @e1 "John Doe"
fill @e2 "user@example.com"
fill @e3 "+1-555-123-4567"
```

**Password:**
```
fill @e4 "SecurePassword123"
```

**Dropdowns:**
```
select @e5 "Option Value"
```

**Checkboxes:**
```
check @e6
uncheck @e7
```

**Radio buttons:**
```
click @e8
```

**Text areas:**
```
fill @e9 "Multi-line text content here"
```

**File uploads:**
```
upload @e10 /path/to/file.pdf
```

### 4. Submit form

```
click @e11
wait --load networkidle
```

Or wait for specific redirect:

```
wait --url "**/success"
```

### 5. Verify submission

```
get url
snapshot -i
screenshot ./form-result.png
```

### 6. Cleanup

```
close
```

## Notes

- Always snapshot before interacting to get current refs
- Re-snapshot after any action that changes the DOM (dropdowns, modals, etc.)
- Use `wait --load networkidle` after form submission
- Check URL or page content to verify success/failure
