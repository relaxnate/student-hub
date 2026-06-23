# Student Hub — Distribution & Auto-Update Guide

This document covers the complete distribution + auto-update system: the
architecture, one-time setup, the day-to-day commands, and the full release
flow from "I finished a feature" to "users have the update."

---

## Architecture (chosen: GitHub Releases + electron-updater + GitHub Actions)

```
  You: git push --follow-tags  (one command)
        │
        ▼
  GitHub Actions (release.yml)
        │  builds Win / macOS / Linux installers in parallel
        │  uploads them + latest*.yml feed files to a GitHub Release
        ▼
  GitHub Release  ◄──────────────────────────────┐
        │                                          │
        │  electron-updater polls latest.yml       │  website (GitHub Pages)
        ▼                                          │  links to newest installer
  Installed app                                    │
   • checks on launch + every 6h                   └── new users download here
   • auto-downloads update in background
   • shows "Restart & update" toast
   • installs on restart (or on next quit)
```

**Why this stack** (vs. the alternatives that were rejected):

| Approach | Verdict |
|---|---|
| **GitHub Releases + electron-updater** ✅ | Free, unlimited bandwidth via GitHub's CDN, native electron-updater provider, CI built-in, zero servers to maintain. Best solo-dev + scale-to-thousands story. **Chosen.** |
| Self-hosted server / S3 + generic provider | More control, but you pay for bandwidth + maintain/secure a server. Unnecessary overhead for a solo dev. |
| Squirrel.Windows directly | Lower-level, Windows-only, more wiring. electron-updater wraps it with cross-platform support. |
| Commercial (todesktop, update.electronjs.org) | Easiest of all, but adds cost/lock-in; update.electronjs.org still needs published GitHub releases and is just a proxy. GitHub direct is simpler and free. |
| Manual "download new version" only | No auto-update = users stay on old versions = support burden. Rejected. |

**Security model:** every release ships a `latest.yml` containing the SHA-512
of each installer. electron-updater downloads the installer over HTTPS and
refuses to apply it unless the hash matches — so a tampered/corrupted file is
rejected even without code signing. (Code signing is still recommended; see
below.)

---

## One-time setup

### 1. Put the project in a GitHub repo
The repo root is the `student-hub/` folder (the one with `package.json`).

```bash
cd student-hub
git init
git add .
git commit -m "initial"
git branch -M main
git remote add origin https://github.com/relaxnate/student-hub.git
git push -u origin main
```

### 2. Replace the placeholders
Search-and-replace `relaxnate` in these files with your real GitHub
username (or org):

- `package.json` → `repository.url` and `build.publish[0].owner`
- `dev-app-update.yml` → `owner`
- `website/index.html` → `const OWNER`

> The `repo` is already `student-hub` everywhere — change it too if you named
> the repo differently.

### 3. That's it for CI
`GITHUB_TOKEN` is provided automatically to GitHub Actions — no secret to add.
The workflow in `.github/workflows/release.yml` builds and publishes on tag push.

### 4. (Optional) Host the download website
Enable **GitHub Pages** on the repo (Settings → Pages → deploy `/website` or a
`gh-pages` branch), or drop `website/index.html` on Netlify/Vercel/Cloudflare
Pages. It auto-detects the visitor's OS and links to the latest installer via
the GitHub API.

---

## Code signing (recommended, not required to ship)

Auto-update **works without signing** thanks to the SHA-512 verification, but:

- **Windows:** unsigned installers trigger a SmartScreen warning. Buy an OV/EV
  code-signing certificate, then add `CSC_LINK` (base64 .pfx) + `CSC_KEY_PASSWORD`
  as repo secrets and pass them in the workflow env. electron-builder signs
  automatically.
- **macOS:** to distribute outside the App Store *and* have auto-update work,
  you must sign + notarize (Apple Developer account, $99/yr). Add `CSC_LINK`,
  `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
  and set `CSC_IDENTITY_AUTO_DISCOVERY: true`. Until then, macOS users
  right-click → Open the first time.
- **Linux:** AppImage needs no signing.

---

## Version management

Versioning is **semver** driven by `package.json`'s `version`, which is the
single source of truth — electron-builder stamps it into the installer and the
`latest.yml` feed, and electron-updater compares it against the running app.

Never edit the version by hand. Use the `release:*` scripts; they run
`npm version`, which bumps `package.json`, commits, and creates the matching
`vX.Y.Z` git tag atomically.

- `release:patch` — bug fixes (0.1.0 → 0.1.1)
- `release:minor` — new features (0.1.0 → 0.2.0)
- `release:major` — breaking changes (0.1.0 → 1.0.0)

---

## Commands you run during development

```bash
npm run dev            # hot-reloading dev app
npm run typecheck      # optional: type safety
npm run build:unpack   # optional: produce an unpacked build to smoke-test
```

To test the **auto-updater itself** locally without releasing:
```bash
# Windows (PowerShell)
$env:FORCE_UPDATE_CHECK="1"; npm run dev
```
With `dev-app-update.yml` pointing at your repo, the updater will query your
real latest release. (Normally the updater is inert in dev.)

---

## Commands you run to ship an update  ← the important part

After you've finished and committed a feature on `main`:

```bash
npm run release:patch     # or release:minor / release:major
```

That single command:
1. bumps the version in `package.json`,
2. commits it and creates a `vX.Y.Z` tag,
3. pushes the commit **and** the tag to GitHub.

The tag push triggers GitHub Actions, which builds every platform, uploads the
installers + update feed to a GitHub Release, and publishes it. Within ~6h
(or on next launch) every installed app sees the update, downloads it silently,
and shows "Restart & update."

**Nothing else to do.** Watch the build at
`https://github.com/relaxnate/student-hub/actions`.

---

## The complete release process, end to end

1. **Code** your feature on `main`; commit it (`git commit`).
2. **Release:** `npm run release:patch`
3. **CI runs** (~5–10 min): builds Win/macOS/Linux, publishes the GitHub Release.
4. **New users** download from your website (always points at the latest).
5. **Existing users** auto-receive it: the app finds the update, downloads it in
   the background, and a toast offers "Restart & update." If they ignore it,
   it installs the next time they quit — so no one is stranded on an old build.

---

## How updates behave for the user (implemented in `UpdaterService`)

- **Check:** on launch (8s after start) and every 6 hours; plus a manual
  **Settings → About → Check for updates** button.
- **Download:** automatic, in the background (`autoDownload = true`).
- **Notify:** a bottom-left toast shows availability → progress → "ready."
- **Install:** "Restart & update" applies it immediately; otherwise it installs
  on next quit (`autoInstallOnAppQuit = true`).
- **Safety:** dev builds never auto-update; corrupted/tampered downloads are
  rejected by SHA-512 mismatch.

---

## Future scaling considerations (thousands+ users)

- **Bandwidth:** GitHub Releases CDN is free and handles this fine. If you ever
  outgrow it or want analytics, switch `build.publish` to S3 + CloudFront — no
  app code changes, electron-updater just reads a different feed URL.
- **Staged rollouts:** electron-builder supports `stagingPercentage` in
  `latest.yml` to release to a % of users first.
- **Channels:** add a `beta` channel (`releaseType`/`channel`) so testers get
  pre-releases while everyone else stays on `latest`.
- **Delta updates:** electron-builder already generates blockmaps for
  differential downloads on Windows, so updates only transfer changed bytes.
- **Crash/telemetry:** pair with Sentry to watch a release's health before it
  reaches everyone.
