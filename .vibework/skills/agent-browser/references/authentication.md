# Authentication Patterns

Patterns for handling login flows, session persistence, and authenticated browsing.

> **Usage:** Pass these commands to the `AgentBrowser` tool's `command` parameter.

## Basic Login Flow

```
# Navigate to login page
open https://app.example.com/login
wait --load networkidle

# Get form elements
snapshot -i
# Output: @e1 [input type="email"], @e2 [input type="password"], @e3 [button] "Sign In"

# Fill credentials
fill @e1 "user@example.com"
fill @e2 "password123"

# Submit
click @e3
wait --load networkidle

# Verify login succeeded
get url  # Should be dashboard, not login
```

## Saving Authentication State

After logging in, save state for reuse:

```
# Login first (see above)
open https://app.example.com/login
snapshot -i
fill @e1 "user@example.com"
fill @e2 "password123"
click @e3
wait --url "**/dashboard"

# Save authenticated state
state save ./auth-state.json
```

## Restoring Authentication

Skip login by loading saved state:

```
# Load saved auth state
state load ./auth-state.json

# Navigate directly to protected page
open https://app.example.com/dashboard

# Verify authenticated
snapshot -i
```

## OAuth / SSO Flows

For OAuth redirects:

```
# Start OAuth flow
open https://app.example.com/auth/google

# Handle redirects automatically
wait --url "**/accounts.google.com**"
snapshot -i

# Fill Google credentials
fill @e1 "user@example.test"
click @e2  # Next button
wait 2000
snapshot -i
fill @e3 "password"
click @e4  # Sign in

# Wait for redirect back
wait --url "**/app.example.com**"
state save ./oauth-state.json
```

## Two-Factor Authentication

Handle 2FA with manual intervention:

```
# Login with credentials
open https://app.example.com/login --headed  # Show browser
snapshot -i
fill @e1 "user@example.com"
fill @e2 "password123"
click @e3

# Wait for user to complete 2FA manually (inform user to complete 2FA)
wait --url "**/dashboard" --timeout 120000

# Save state after 2FA
state save ./2fa-state.json
```

## HTTP Basic Auth

For sites using HTTP Basic Authentication:

```
# Set credentials before navigation
set credentials username password

# Navigate to protected resource
open https://protected.example.com/api
```

## Cookie-Based Auth

Manually set authentication cookies:

```
# Set auth cookie
cookies set session_token "abc123xyz"

# Navigate to protected page
open https://app.example.com/dashboard
```

## Token Refresh Handling

For sessions with expiring tokens, use this workflow:

```
# Try loading existing state
state load "./auth-state.json"
open https://app.example.com/dashboard

# Check if session is still valid by checking URL
get url
# If redirected to login, session expired - re-authenticate:
snapshot -i
fill @e1 "username"
fill @e2 "password"
click @e3
wait --url "**/dashboard"
state save "./auth-state.json"
```

## Security Best Practices

1. **Never commit state files** - They contain session tokens

2. **Use environment variables for credentials** - Don't hardcode passwords

3. **Clean up after automation**
   ```
   cookies clear
   ```

4. **Use short-lived sessions for CI/CD**
   ```
   # Don't persist state in CI
   open https://app.example.com/login
   # ... login and perform actions ...
   close  # Session ends, nothing persisted
   ```
