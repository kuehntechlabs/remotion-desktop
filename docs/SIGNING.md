# Code Signing Runbook

This document covers everything needed to ship signed builds of Remotion
Desktop for **macOS** (Developer ID + Apple notarisation) and **Windows**
(Azure Trusted Signing). It is the source of truth for the signing setup —
keep it updated as steps complete.

The build pipeline is designed so that signing turns on **automatically** when
the relevant credentials are present (either via local `.env` or via GitHub
secrets), and falls back to unsigned builds when they are missing. No code
changes needed to toggle signing.

---

## Why we sign

| Without signing | With signing |
|---|---|
| macOS: Gatekeeper rejects, user must right-click → Open, or `xattr -cr` | App opens normally on any Mac |
| Windows: SmartScreen warns "Unknown Publisher" | Installer trusted out of the box (EV-equivalent via Trusted Signing) |
| Auto-updates fail silently on macOS | Auto-updates work |
| Intune push install fails silently on macOS | Intune push works (see [`INTUNE.md`](./INTUNE.md)) |

---

## Where the signing config lives

| File | Purpose |
|---|---|
| `electron-builder.js` | Build config; enables signing per-platform based on env vars |
| `scripts/build.js` | Local build entry — loads `.env` if present |
| `.env.example` | Template for the credentials to keep in `.env` (gitignored) |
| `build/entitlements.mac.plist` | macOS hardened-runtime entitlements |
| `.github/workflows/release-build.yml` | Maps GitHub secrets into the build env |

---

## macOS — Apple Developer ID + Notarisation

### Status

- [ ] Apple Developer Program membership active
- [ ] Developer ID Application certificate issued
- [ ] `.p12` exported and stored
- [ ] App-specific password generated
- [ ] Local `.env` populated
- [ ] GitHub secrets populated (CI signing)

### One-time setup

#### 1. Apple Developer Program

- Enroll at <https://developer.apple.com/programs/>
- Choose **Organization** (von Poll Immobilien GmbH) — requires D-U-N-S number
- Cost: ~99 €/year
- You become the Team Agent. Invite additional developers via App Store Connect.

#### 2. Create Developer ID Application certificate

In the Apple Developer Portal → Certificates, Identifiers & Profiles → **Certificates**:

1. Click **+**, choose **Developer ID Application** (NOT "Mac App Distribution")
2. Generate a CSR from macOS Keychain Access:
   - Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority
   - Use your Apple ID email, common name e.g. "von Poll Immobilien GmbH"
   - Save to disk
3. Upload the `.certSigningRequest` file
4. Download the resulting `.cer` and double-click to import into Keychain

#### 3. Export `.p12`

- Keychain Access → "My Certificates" → expand the "Developer ID Application" entry
- Right-click the private key entry → **Export**
- Format: Personal Information Exchange (`.p12`)
- Set a strong password — you will need it as `CSC_KEY_PASSWORD`

Store the `.p12` somewhere outside the repo (or in `./secrets/` which is gitignored).

#### 4. App-specific password for notarisation

- Go to <https://appleid.apple.com> → Sign-In and Security → App-Specific Passwords
- Generate a new password labelled "remotion-desktop-notarytool"
- Save it — this is `APPLE_APP_SPECIFIC_PASSWORD`

#### 5. Look up the Team ID

- developer.apple.com → top right → 10-character string (e.g. `ABCD123456`)
- This is `APPLE_TEAM_ID`

### Env vars

| Variable | Value |
|---|---|
| `CSC_LINK` | Absolute path to `.p12`, or base64 of the file in CI |
| `CSC_KEY_PASSWORD` | Password set when exporting the `.p12` |
| `APPLE_ID` | Apple ID email (e.g. `patrick.kuehn@von-poll.com`) |
| `APPLE_APP_SPECIFIC_PASSWORD` | From step 4 |
| `APPLE_TEAM_ID` | From step 5 |

For CI, base64-encode the `.p12` and store as a secret:

```bash
base64 -i developer-id.p12 | pbcopy
```

Then in GitHub → Settings → Secrets and variables → Actions, add:

| GitHub Secret | Source |
|---|---|
| `MAC_CSC_LINK` | base64 string |
| `MAC_CSC_KEY_PASSWORD` | `.p12` password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | from step 4 |
| `APPLE_TEAM_ID` | from step 5 |

The workflow already maps these via `electron-builder`'s expected names.

---

## Windows — Azure Trusted Signing

### Status

- [x] Subscription chosen: **VPI - Team Digital**
- [x] Resource provider `Microsoft.CodeSigning` registered
- [x] Trusted Signing Account `digital` created in West Europe (`rg-compute-prod-euw`)
- [ ] Identity Validation submitted (Public Trust)
- [ ] Identity Validation approved by Microsoft
- [ ] Certificate Profile `remotion-desktop` created
- [ ] Entra ID App Registration + Service Principal created
- [ ] Role "Trusted Signing Certificate Profile Signer" assigned to SP
- [ ] GitHub secrets populated (CI signing)

### Account at a glance

| Property | Value |
|---|---|
| Account name | `digital` |
| Resource group | `rg-compute-prod-euw` |
| Region | West Europe |
| Endpoint | `https://weu.codesigning.azure.net/` |
| Subscription ID | `9e5fb41a-bc43-4901-963a-ac9a57d2717e` |
| SKU | Basic (5,000 signatures/month, 10 certificate profiles) |
| Cert profile name (planned) | `remotion-desktop` |

### One-time setup

#### 1. Identity Validation

Azure Portal → Trusted Signing Account `digital` → **Identity validations** → **+ Create new**.

- Type: **Public Trust** (NOT Test, NOT Private — Public Trust is what makes
  Windows trust the signature out of the box for any user)
- Legal entity name: exactly as registered (e.g. "von Poll Immobilien GmbH")
- D-U-N-S Number: 9-digit number from Dun & Bradstreet
  - If you don't have one yet, request it free at <https://www.dnb.com/duns/get-a-duns.html>
  - This is the bottleneck — can take 1–14 business days
- Address, phone, email: must match D&B records exactly
- Verifier: a person with signing authority (Geschäftsführer / Prokurist) with
  a company-domain email

Microsoft validates against D&B. If records match, approval is fast (sometimes
hours). Otherwise Microsoft requests supporting documents.

#### 2. Certificate Profile

After Identity Validation is **approved**:

Azure Portal → Trusted Signing Account → **Certificate profiles** → **+ Create**.

- Name: `remotion-desktop` (must match `AZURE_CERT_PROFILE_NAME` in code,
  currently the default in `electron-builder.js`)
- Identity Validation: select the one approved above
- Certificate type: Public Trust

Certificates are auto-rotated by Microsoft every few days; no manual renewal.

#### 3. Entra ID App Registration + Service Principal

This gives CI a credential to call the signing API.

Azure Portal → **Microsoft Entra ID** → **App registrations** → **+ New registration**.

1. Name: `remotion-desktop-signing`
2. Supported account types: Single tenant
3. Redirect URI: leave empty
4. Click Register

In the new app:

1. **Overview** — copy:
   - **Application (client) ID** → `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_TENANT_ID`
2. **Certificates & secrets** → **+ New client secret** → set a long expiry
   (e.g. 24 months) → copy the **Value** immediately → `AZURE_CLIENT_SECRET`

#### 4. Role assignment

The Service Principal must be granted the right to sign with the cert profile.

Azure Portal → Trusted Signing Account `digital` → **Access control (IAM)** →
**+ Add → Add role assignment**.

- Role: **Trusted Signing Certificate Profile Signer**
- Assign access to: **User, group, or service principal**
- Members: search for `remotion-desktop-signing` (the SP)
- Save

#### 5. GitHub secrets

GitHub → repo → Settings → Secrets and variables → Actions → New secret:

| GitHub Secret | Source |
|---|---|
| `AZURE_TENANT_ID` | step 3.1 |
| `AZURE_CLIENT_ID` | step 3.1 |
| `AZURE_CLIENT_SECRET` | step 3.2 |

Account name, profile name and endpoint are hard-coded as defaults in
`electron-builder.js`, so they do **not** need GitHub secrets. Set them as
secrets only if you ever need to override (e.g. switching to a different
account for staging).

---

## Local builds

```bash
cp .env.example .env
# fill in the credentials you have (rest can stay blank)
npm run build
```

The output of `scripts/build.js` will tell you which platforms are signed:

```
[build] Loaded credentials from .env
[electron-builder] macOS: signed + notarised
[electron-builder] Windows: signed via Trusted Signing (digital/remotion-desktop @ https://weu.codesigning.azure.net/)
```

If a credential group is missing, that platform falls through to unsigned —
useful for testing the build pipeline before signing is ready.

On Apple Silicon you can only produce the macOS artifact locally; Windows
requires a Windows host or the GitHub Actions runner.

---

## CI builds

Tag-pushing triggers `.github/workflows/release-build.yml`:

```bash
npm version patch        # bumps version + creates tag
git push --follow-tags   # CI builds + publishes the release
```

Each runner picks up whichever secrets are configured:

- All Apple secrets set → signed + notarised DMG
- All Azure secrets set → signed NSIS installer
- Missing → unsigned for that platform; the rest still ships

---

## Verifying a signed build

### macOS

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Remotion Desktop.app"
spctl --assess --type execute --verbose "/Applications/Remotion Desktop.app"
xcrun stapler validate "/Applications/Remotion Desktop.app"
```

All three should succeed with no warnings.

### Windows

Right-click the `.exe` → Properties → Digital Signatures. There should be
exactly one entry with the validated legal entity as signer, and the
"Details" should show a valid timestamp and certificate chain.

---

## Troubleshooting

### macOS: notarisation fails with "Invalid credentials"

`APPLE_APP_SPECIFIC_PASSWORD` is bound to your Apple ID and revokes itself if
you sign out of iCloud. Regenerate it at <https://appleid.apple.com>.

### macOS: "Hardened Runtime is not enabled" during notarisation

`build/entitlements.mac.plist` must exist and `electron-builder.js` must set
`hardenedRuntime: true` (it does, automatically, when `CSC_LINK` is set).

### Windows: "Insufficient permissions to perform signing operation"

The Service Principal does not have the **Trusted Signing Certificate Profile
Signer** role on the account. Re-do step 4 of the Azure setup.

### Windows: "Identity validation not found"

Certificate profile was created without selecting an approved Identity
Validation, or the validation expired. Open the profile and re-link.

### CI: build is unsigned despite secrets being set

Check the workflow log for the line `[electron-builder] Windows: building
unsigned (Azure secrets missing)`. If it appears, one of the three secrets
(`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`) is missing or
empty.
