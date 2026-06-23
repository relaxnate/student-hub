# Building Student Hub — Windows Installer (.exe)

## Quick build (after npm install works)

```powershell
cd "C:\Users\zahis\Downloads\student-hub-v7\student-hub"
npm install
npm run build:win
```

The installer will appear at: `dist\StudentHub-Setup-0.1.0.exe`

---

## What the installer does

- Standard Windows install wizard (Next → Next → Install)
- Installs to `C:\Program Files\Student Hub\` by default (user can change)
- Creates Start Menu shortcut → Student Hub
- Creates Desktop shortcut → Student Hub
- Registers `student-hub://` protocol so Canvas OAuth callbacks work
- Uninstall via Windows Settings → Apps (fully cleans up)

---

## Running the dev build (what you've been doing)

```powershell
npm run dev
```
This opens the app in development mode with hot-reload.

---

## Sharing with other students

1. Build the installer once: `npm run build:win`
2. Share the file: `dist\StudentHub-Setup-0.1.0.exe` (about 80–120 MB)
3. They run it, click through the installer, done
4. Each student enters their own Canvas URL + Personal Access Token

---

## Icon

The app icon is at `build\icon.ico` (already generated — a purple SH logo).
To use a custom icon, replace `build\icon.ico` with your own 256×256 ICO file.

---

## Troubleshooting build issues

**"Cannot find module 'electron-builder'"**
```powershell
npm install --save-dev electron-builder
```

**The .exe doesn't start / missing DLL**
This usually means better-sqlite3 wasn't compiled for the packaged Electron.
Run `npm run rebuild` before `npm run build:win`.

**Code signing warnings**
The built .exe will show a "Unknown publisher" SmartScreen warning on first run.
Click "More info → Run anyway". This is normal for unsigned apps.
To suppress: purchase a code signing certificate from Sectigo/DigiCert (~$200/yr).
