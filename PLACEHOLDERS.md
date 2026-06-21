# Placeholder Pattern Reference

## Overview

This template uses a **consistent placeholder pattern** to indicate values that must be replaced with actual configuration. This helps avoid false positives from GitHub secret detection while making it clear what needs to be customized.

## Pattern

All placeholders follow this format:

```
{{VARIABLE_NAME}}
```

**Example**:
```bash
# Before (placeholder)
SAML_ENTRY_POINT={{YOUR_SAML_IDP_SSO_URL}}

# After (actual value)
SAML_ENTRY_POINT=https://idp.example.com/saml/sso
```

## Common Placeholders

### Authentication - SAML 2.0

| Placeholder | Description | Format |
|-------------|-------------|--------|
| `{{YOUR_SAML_IDP_SSO_URL}}` | Identity Provider SSO URL | `https://idp.example.com/saml/sso` |
| `{{YOUR_IDP_CERTIFICATE_BASE64}}` | IdP public certificate | PEM format, single line with `\n` |
| `{{YOUR_SP_PRIVATE_KEY_BASE64}}` | Service Provider private key | PEM format, single line with `\n` |
| `{{YOUR_SP_CERTIFICATE_BASE64}}` | Service Provider certificate | PEM format, single line with `\n` |
| `{{YOUR_SAML_IDP_LOGOUT_URL}}` | Single Logout URL | `https://idp.example.com/saml/logout` |

### API Gateway (S2S OAuth)

| Placeholder | Description | Where to Find |
|-------------|-------------|---------------|
| `{{AZURE_TENANT_ID}}` | Azure AD Tenant ID | Azure Portal → Azure Active Directory → Overview |
| `{{S2S_CLIENT_ID}}` | S2S OAuth client ID | Azure Portal → App registrations → Your app → Overview |
| `{{S2S_CLIENT_SECRET}}` | S2S OAuth client secret | Azure Portal → App registrations → Certificates & secrets |
| `{{S2S_OAUTH_SCOPE}}` | OAuth scope for private API | e.g. `api://private-app/.default` |
| `{{PRIVATE_BACKEND_URL}}` | Private backend API URL | e.g. `http://private-api:3001/api/v1` |

### Session & Security

| Placeholder | Description | How to Generate |
|-------------|-------------|-----------------|
| `{{GENERATE_WITH_OPENSSL_RAND_BASE64_32}}` | Session secret (32+ characters) | `openssl rand -base64 32` |
| `{{REDIS_CONNECTION_STRING}}` | Redis connection URL | `redis://hostname:6379` |

## Files Using Placeholders

### Environment Configuration

- [.env.example](.env.example) - Development with mock auth
- [.env.external.example](.env.external.example) - External (SAML) production

### Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment examples
- [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md) - Authentication setup
- [docs/SECURITY.md](docs/SECURITY.md) - Security configuration
- [TEMPLATE-GUIDE.md](TEMPLATE-GUIDE.md) - Customization guide

## Usage Instructions

### 1. Identify Placeholders

Look for values wrapped in `{{...}}`:

```bash
# .env.external.example
SAML_ENTRY_POINT={{YOUR_SAML_IDP_SSO_URL}}
SAML_CERT={{YOUR_IDP_CERTIFICATE_BASE64}}
REDIS_URL={{REDIS_CONNECTION_STRING}}
```

### 2. Replace with Actual Values

Remove the `{{` and `}}` brackets and insert your real values:

```bash
# .env (your actual config)
SAML_ENTRY_POINT=https://idp.example.com/saml/sso
SAML_CERT=MIICpDCCAYwCCQ...
REDIS_URL=redis://my-redis:6379
```

### 3. Verify No Placeholders Remain

Before deploying, ensure no `{{...}}` patterns remain:

```bash
# Search for unreplaced placeholders
grep -r "{{" .env

# Should return nothing if all placeholders are replaced
```

## Why This Pattern?

### Problem

GitHub's secret detection can flag example values as potential secrets:

- `your-client-secret-here` - Flagged as potential secret
- `<CLIENT_SECRET>` - Flagged as potential secret
- `CHANGE_THIS` - Flagged as potential secret

### Solution

Using `{{VARIABLE_NAME}}` avoids false positives:

- `{{YOUR_SAML_IDP_SSO_URL}}` - Recognized as placeholder
- Clear indication that value must be replaced
- Consistent pattern across all files
- Easy to search and validate

## Best Practices

### For Template Users

1. **Never commit actual secrets** - Only use placeholders in example files
2. **Use .gitignore** - Ensure `.env` is ignored (not `.env.example`)
3. **Search before deploy** - Run `grep "{{" .env` to find unreplaced placeholders
4. **Use secret managers** - Store production secrets in Azure Key Vault, not files

### For Template Maintainers

1. **Always use `{{VARIABLE_NAME}}` format** - Never use `<VAR>`, `$VAR`, or descriptive text
2. **Document all placeholders** - Add to this file when introducing new ones
3. **Include examples** - Show format in comments above placeholder
4. **Test detection** - Verify GitHub doesn't flag placeholders as secrets

## Related Documentation

- [AUTH-SETUP.md](docs/AUTH-SETUP.md) - Detailed authentication configuration
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment-specific configuration
- [SECURITY.md](docs/SECURITY.md) - Security best practices
- [TEMPLATE-GUIDE.md](TEMPLATE-GUIDE.md) - Complete customization guide
