# Intune Deployment Runbook

How to roll out Remotion Desktop to managed Windows and macOS devices via
**Microsoft Intune**.

Both flows assume the artifacts coming out of `npm run build` (or the GitHub
Actions release workflow) are properly **signed**:

- macOS: signed with Developer ID + **notarised + stapled** (otherwise
  Gatekeeper blocks the silent install Intune attempts).
- Windows: signed with Azure Trusted Signing (otherwise SmartScreen warns and
  some restrictive AppLocker / WDAC policies refuse to launch it).

See [`SIGNING.md`](./SIGNING.md) for the signing setup. Intune will *accept*
unsigned uploads but device-side install will fail or get blocked on most
hardened estates.

---

## Windows — Win32 app (.intunewin)

Intune wraps installers in its own `.intunewin` container. The wrapping is done
by Microsoft's `IntuneWinAppUtil.exe` tool (Windows only). After wrapping you
upload to Intune and configure install + detection.

### Prerequisites

- A Windows machine (real, VM, or GitHub Actions Windows runner) — wrapping is
  Windows-only.
- The signed `RemotionDesktop.exe` produced by the build.
- Intune Administrator role in Entra ID.

### 1. Wrap the .exe

PowerShell helper at [`scripts/package-intune-win.ps1`](../scripts/package-intune-win.ps1)
downloads `IntuneWinAppUtil.exe` on first run and wraps the installer:

```powershell
# from a Windows host with the signed .exe in dist\
pwsh ./scripts/package-intune-win.ps1 -Installer dist/RemotionDesktop.exe -OutDir dist/intune
# → dist/intune/RemotionDesktop.intunewin
```

### 2. Upload to Intune Admin Center

[intune.microsoft.com](https://intune.microsoft.com) → **Apps** → **Windows** →
**+ Add** → **Windows app (Win32)**.

| Field | Value |
|---|---|
| App package file | `RemotionDesktop.intunewin` from step 1 |
| Name | `Remotion Desktop` |
| Publisher | `von Poll Immobilien GmbH` |
| App version | matches `package.json` (e.g. `1.2.3`) |
| Category | Productivity |
| Logo | `build/icon.png` (optional) |

### 3. Program — install/uninstall commands

The NSIS installer (electron-builder default, `oneClick: true`) runs silently
without flags.

| Field | Value |
|---|---|
| Install command | `"RemotionDesktop.exe" /S` |
| Uninstall command | `"%LOCALAPPDATA%\Programs\remotion-desktop\Uninstall Remotion Desktop.exe" /S` |
| Install behavior | **User** (NSIS `perMachine: false` → installs into user profile) |
| Device restart behavior | No specific action |

If you later switch to `perMachine: true` in `electron-builder.js`, change
install behavior to **System** and the uninstall path to
`%ProgramFiles%\Remotion Desktop\Uninstall Remotion Desktop.exe`.

### 4. Requirements

| Field | Value |
|---|---|
| Operating system architecture | x64 |
| Minimum operating system | Windows 10 1809 (Electron 41 requirement) |

### 5. Detection rules

Intune polls these to know whether the app is already installed.

| Rule type | Path / value |
|---|---|
| File | Path `%LOCALAPPDATA%\Programs\remotion-desktop` |
| File or folder | `Remotion Desktop.exe` |
| Detection method | File or folder exists |

Alternative (more precise, survives reinstalls): registry detection on
`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\remotion-desktop`
checking `DisplayVersion` matches the uploaded version.

### 6. Assignments

Assign to the user/device group you target (e.g. `grp-vpi-creative` for the
marketing team). Choose **Required** for auto-install, **Available** to let
users opt in via the Company Portal.

### 7. Verify

After ~15 min sync window: on a test device, run `Get-IntuneManagedDevice` via
PowerShell or open Company Portal → installed apps → confirm `Remotion Desktop`
shows up and launches without SmartScreen warnings.

---

## macOS — DMG line-of-business app

Intune supports `.dmg` uploads directly since 2023 — no wrapping tool needed.
Apple notarisation is mandatory for the install to complete silently.

### Prerequisites

- The signed + **notarised + stapled** `RemotionDesktop.dmg` from the build.
- Verify stapling: `xcrun stapler validate dist/RemotionDesktop.dmg`
- Intune Administrator role + macOS devices enrolled (Company Portal or
  Apple Business Manager + ABM-assigned).

### 1. Upload to Intune Admin Center

[intune.microsoft.com](https://intune.microsoft.com) → **Apps** → **macOS** →
**+ Add** → **macOS app (DMG)**.

| Field | Value |
|---|---|
| App package file | `RemotionDesktop.dmg` |
| Name | `Remotion Desktop` |
| Publisher | `von Poll Immobilien GmbH` |
| Ignore app version | **Yes** — let electron-updater handle in-app updates instead of redeploying through Intune |
| Logo | `build/icon.png` |

### 2. Included apps

Intune extracts the bundle list automatically. Confirm exactly one entry:

| Bundle ID | Build number |
|---|---|
| `com.remotion.desktop` | matches `package.json` version |

If Intune asks for these manually, the bundle ID is the `appId` in
`electron-builder.js` and the build number is the `version` from
`package.json`.

### 3. Requirements

| Field | Value |
|---|---|
| Minimum operating system | macOS 11.0 (Electron 41 requirement) |

### 4. Assignments

Same as Windows — Required for auto-install, Available for opt-in. Macs sync
roughly every 8 hours; force with **Sync** in System Settings → General →
Device Management.

### 5. Verify

On a test Mac after sync:

```bash
# App installed?
ls /Applications/Remotion\ Desktop.app

# Signature still valid after Intune install?
codesign --verify --deep --strict --verbose=2 "/Applications/Remotion Desktop.app"

# Stapling intact?
xcrun stapler validate "/Applications/Remotion Desktop.app"

# Will Gatekeeper let it run silently?
spctl --assess --type execute --verbose "/Applications/Remotion Desktop.app"
```

All four should succeed without warnings. If `spctl` complains about
notarisation, the build was not notarised — fix the build pipeline before
re-uploading.

---

## Release cadence

Two viable patterns; pick one:

### A. Intune-driven (heavy)

Every release: build → upload new .intunewin / .dmg to Intune → Intune pushes
to devices. Inventory in Intune is always current. Slow for users — they wait
for the next sync to get patches.

Suited if you want full version control from Intune.

### B. Auto-updater driven (light, recommended)

Intune deploys version N once (initial rollout). Subsequent versions ship via
**electron-updater** from GitHub Releases (already wired in `main.ts`). Users
get updates within minutes of the GitHub release, no Intune involvement.

Set "Ignore app version" = **Yes** on the macOS upload (and a permissive
detection rule on Windows, e.g. just "folder exists") so Intune doesn't fight
the auto-updater.

Suited for fast iteration.

---

## Troubleshooting

### macOS: "App could not be installed" / `0x87D30137`

The DMG is not notarised, or the notarisation was not stapled. Run:

```bash
xcrun stapler validate dist/RemotionDesktop.dmg
```

If it says "does not have a ticket stapled", regenerate with all Apple env
vars present so `electron-builder` runs `xcrun stapler staple` after notarising.

### Windows: install succeeds but app never appears in Start Menu

`perMachine: false` (current default) installs into `%LOCALAPPDATA%\Programs`
and runs in the user's session — but Intune installed under the SYSTEM
account, so the app landed in `C:\Windows\System32\config\systemprofile\...`
where no user can see it.

Fix: either change to `perMachine: true` in `electron-builder.js` and re-wrap,
or set Install behavior to **User** in the Intune Program tab (intermittent
on shared devices).

### Windows: SmartScreen still warns despite Azure Trusted Signing

Trusted Signing certificates need a few signed builds to "warm up"
SmartScreen's reputation. First few hundred installs may still warn even
though the signature is valid. This is expected and resolves itself within
a couple of weeks of distribution.

### Intune sync is slow

Force on Windows: **Settings → Accounts → Access work or school → Info →
Sync**. Force on macOS: **System Settings → General → Device Management →
Sync**. Or via Company Portal → top right → Sync.
