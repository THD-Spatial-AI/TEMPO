# Building the Desktop App

This page covers how to compile the Go backend and package the full application as a Windows NSIS installer.

---

## Step 1 — Build the Go backend

```powershell
cd backend-go
go build -o backend.exe .
cd ..
```

The `backend.exe` binary must be present in `backend-go/` before packaging.

---

## Step 2 — Build the frontend

```powershell
npm run build
```

Vite bundles the React application into `dist/`. The Electron wrapper loads this directory as a local HTML page.

---

## Step 3 — Package with Electron Builder

```powershell
npm run build:electron
```

This runs `electron-builder` with the configuration in `package.json`. The output NSIS installer is written to the `output` directory defined in `package.json` (`C:\temp\calliope-release\` by default).

To change the output path, edit the `build.directories.output` field in `package.json`.

---

## What gets packaged

`electron-builder` creates an ASAR archive from the `dist/`, `electron/`, `backend-go/`, and `python/` directories. The backend binary and Python runner are excluded from the ASAR and placed in `app.asar.unpacked/` so the OS can execute them:

```json
"asarUnpack": [
  "backend-go/**/*",
  "python/**/*"
]
```

---

## Installer options

The NSIS installer is configured as a one-click or guided install (user's choice):

| Option | Value |
|---|---|
| One-click install | Disabled |
| Change install dir | Enabled |
| Desktop shortcut | Created |
| Start menu shortcut | Created |

---

## Build artifacts

| Artifact | Location |
|---|---|
| Installer (`.exe`) | `C:\temp\calliope-release\TEMPO Setup x.x.x.exe` |
| Unpacked app dir | `C:\temp\calliope-release\win-unpacked\` |

---

## Versioning

The application version is read from the `version` field in `package.json`. Increment it before each release build:

```json
"version": "1.0.0"
```

---

## Releasing and in-app updates

Installed copies of TEMPO check the latest GitHub release at startup and every 6 hours (`electron/updater.cjs`) and offer to update. For that to work, every release must follow these rules:

1. **Bump the version** in `package.json` (e.g. `4.1.0`) before building. The app compares this with the release.
2. **Version in the tag or title**: the tag or release title must contain `x.y.z`, e.g. `Release_V4.1.0` / `TEMPO V4.1.0`.
3. **Publish as a full release**, not a draft or pre-release. Only the release marked *Latest* is offered.
4. **Upload the three build outputs with their default names**:

    | Platform | File | How it is applied |
    |---|---|---|
    | Windows | `TEMPO Setup x.y.z.exe` (`*.exe`) | Installer is launched, TEMPO closes |
    | Linux AppImage | `TEMPO-x.y.z.AppImage` | File is replaced and TEMPO restarts |
    | Linux Debian | `tempo_x.y.z_amd64.deb` | Installed with `pkexec dpkg -i`, TEMPO restarts |

5. **Release notes**: use `## Added` / `## Fixed` style headings with bullet points; the first bullets are shown in the update dialog.

GitHub stores a SHA-256 digest for every uploaded asset; the updater verifies the download against it before installing.

### Testing the update flow

Run the dev build pretending to be an older version. The real latest release is downloaded and verified, but nothing is installed (the file is shown in its folder):

```bash
TEMPO_UPDATE_TEST_VERSION=3.0.0 make dev
```

The variable is ignored in packaged builds. Users can turn automatic checks off in **Settings → General** and check manually in **Settings → About**.

!!! note "Windows code signing"
    The installer is not code-signed, so Windows SmartScreen may warn when it is launched by the updater. Signing the NSIS installer removes the warning.

---

## CI / CD

The GitLab CI pipeline (`gitlab-ci.yml`) currently only builds the documentation PDF. A separate pipeline stage for the Electron build can be added by including a Windows runner with Node.js and Go installed.
