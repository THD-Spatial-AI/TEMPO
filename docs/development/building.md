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

## CI / CD

The GitLab CI pipeline (`gitlab-ci.yml`) currently only builds the documentation PDF. A separate pipeline stage for the Electron build can be added by including a Windows runner with Node.js and Go installed.
