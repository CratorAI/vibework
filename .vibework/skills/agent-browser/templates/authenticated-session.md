# Authenticated Session Workflow

Login once, save state, reuse for subsequent sessions.

## Workflow

### 1. Check for existing state

If you have a saved state file, try loading it first:

```
state load ./auth-state.json
open https://app.example.com/dashboard
```

Check the URL - if redirected to login, the session expired and you need to re-authenticate.

### 2. Discovery: Find form elements

```
open https://app.example.com/login
wait --load networkidle
snapshot -i
```

Note the refs for:
- Username/email field: `@e?`
- Password field: `@e?`
- Submit button: `@e?`

### 3. Perform login

```
fill @e1 "username"
fill @e2 "password"
click @e3
wait --load networkidle
```

### 4. Verify success

```
get url
```

If still on login page, login failed. Otherwise:

```
state save ./auth-state.json
```

### 5. Future sessions

```
state load ./auth-state.json
open https://app.example.com/dashboard
```

## Notes

- Always use `--headed` and `--profile` flags when opening
- State files contain auth tokens - don't commit them
- Re-authenticate if session expires
