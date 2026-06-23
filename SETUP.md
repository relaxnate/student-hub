# Student Hub — Setup Guide

## The short version

```bash
node -v                          # must be v20+
unzip student-hub-v4.zip
cd student-hub
cp .env.example .env             # leave it empty — Canvas needs no credentials
npm install                      # takes 2–4 min (compiles native SQLite)
npm run dev                      # app opens
```

Then in the app: enter your Canvas URL + Personal Access Token and click Connect.
That's it. No admin access, no developer keys, no special permissions.

---

## Step 0 — Install prerequisites (one-time)

### Check Node.js
```bash
node -v   # needs to say v20.x.x or higher
npm -v    # needs to say 9.x or higher
```
Download from https://nodejs.org if missing — pick the LTS version.

### Install build tools (needed for the native SQLite module)

**macOS**
```bash
xcode-select --install
```
A dialog appears — click Install. Takes about 5 minutes.
If it says "already installed", skip it.

**Windows**
1. Download Visual Studio Build Tools 2022 from:
   https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
2. During install, check **"Desktop development with C++"**
3. You do NOT need the full Visual Studio IDE — just the Build Tools

**Linux**
```bash
sudo apt-get install -y build-essential python3    # Ubuntu / Debian
sudo dnf groupinstall "Development Tools"          # Fedora
```

---

## Step 1 — Unzip and enter the project

```bash
unzip student-hub-v4.zip
cd student-hub
```

---

## Step 2 — Create your .env file

```bash
cp .env.example .env
```

**For Canvas, leave .env completely empty.** No credentials needed.
Canvas students connect using a Personal Access Token, which is different from an API key
and requires zero admin setup.

---

## Step 3 — Install dependencies

```bash
npm install
```

This installs all packages and automatically recompiles `better-sqlite3`
(the native SQLite module) for the Electron version bundled in the project.
Takes 2–4 minutes. You'll see a lot of output — that's normal.

---

## Step 4 — Start the app

```bash
npm run dev
```

A window opens showing the Welcome screen.

---

## Step 5 — Generate your Canvas Personal Access Token

A Personal Access Token (PAT) lets any Canvas student access the API
using their own account. No admin. No developer key. No special permissions.

**Steps (takes about 30 seconds):**

1. Open Canvas in your browser and log in with your school account
2. Click your **name or avatar** — usually top-left or top-right
3. Click **Settings** (this is your account settings, not a course's settings)
4. Scroll down until you see **"Approved Integrations"**
5. Click **"+ New Access Token"**
6. Fill in:
   - **Purpose:** Student Hub  *(or anything you want)*
   - **Expires:** leave blank for no expiry, or pick a date
7. Click **Generate Token**
8. **Copy the entire token** — it looks like:  
   `1234~AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijk`

> ⚠️ Canvas shows the token only once. Copy it immediately.
> If you lose it, just delete it and generate a new one.

---

## Step 6 — Connect in the app

Back in Student Hub:

1. **Your school's Canvas URL** — enter the URL you see when you use Canvas.
   Examples:
   - `https://university.instructure.com`
   - `https://canvas.myschool.edu`
   - `https://myschool.canvas.com`
   
   If unsure: go to Canvas in your browser, copy the address bar URL,
   and remove everything after the domain name.

2. **Personal Access Token** — paste the token you just copied

3. Click **Connect Canvas**

The app verifies your token (takes about 2 seconds), then starts syncing.
Your courses, modules, assignments, grades, and files appear within 1–2 minutes.

---

## What gets synced

After connecting, Student Hub imports:

| What | Details |
|------|---------|
| Courses | All your active enrolled courses |
| Modules | Exact structure your instructor created — position and hierarchy preserved |
| Module items | Assignments, files, pages, quizzes, links — in order |
| Assignments | Title, full instructions, due date, rubric, attached files, points |
| Grades | Score, letter grade, instructor feedback/comments |
| Files | All course files with their folder structure |
| Pages | Published course pages with full content |
| Calendar | Assignment due dates as calendar events |

---

## Troubleshooting

### npm install fails with build errors

**macOS:** `xcode-select --install` → try `npm install` again  
**Windows:** Install Visual Studio Build Tools 2022 with "Desktop development with C++"  
**Linux:** `sudo apt-get install build-essential python3` → try again

### "better-sqlite3 is not a valid module" error when the app starts

The native module compiled for the wrong version. Fix:
```bash
npm run rebuild
npm run dev
```

### App opens but shows a blank white screen

Press `Ctrl+Shift+I` (or `Cmd+Option+I` on macOS) to open DevTools.
Check the Console tab — the error message tells you exactly what's wrong.

### "Token rejected" error in the app

- Make sure you copied the **entire** token (they're long — about 50+ characters)
- Check the token hasn't expired (Canvas Settings → Approved Integrations → check date)
- Try generating a fresh token and connecting again

### "Could not reach Canvas URL" error

- Check you have internet access
- Double-check the URL — try opening it in your browser first
- Make sure there's no typo — it should end in `.instructure.com` or `.edu` or similar
- Don't include a path — just the domain: `https://school.instructure.com` ✓  
  Not: `https://school.instructure.com/courses/12345` ✗

### Canvas URL format

The app accepts all of these formats (it normalises them):
```
university.instructure.com
https://university.instructure.com
https://university.instructure.com/
```

### Sync takes a long time

Normal for first sync with many courses. Canvas rate-limits API requests.
A typical student with 5–6 courses + files takes about 1–3 minutes.

### Token expired after a while

Go back to Canvas Settings → Approved Integrations → delete the old token
→ generate a new one → Settings → Integrations in Student Hub → disconnect → reconnect.

---

## Where data is stored

| Item | Location |
|------|----------|
| Database | macOS: `~/Library/Application Support/student-hub/data/student-hub.db` |
| | Windows: `%APPDATA%\student-hub\data\student-hub.db` |
| | Linux: `~/.config/student-hub/data/student-hub.db` |
| Downloaded files | `{above folder}/files/` |
| Token | Your OS keychain (macOS Keychain / Windows Credential Manager / Linux libsecret) |

To start completely fresh, delete the `data/` folder and reopen the app.

---

## npm commands

```bash
npm run dev          # start with hot reload (development)
npm run build        # compile for production
npm run build:mac    # build a .dmg installer for macOS
npm run build:win    # build a .exe NSIS installer for Windows
npm run build:linux  # build .AppImage + .deb for Linux
npm run rebuild      # recompile native modules (use if SQLite errors appear)
npm run typecheck    # check TypeScript without building
```
