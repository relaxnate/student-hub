# Student Hub

A production-grade desktop application for students that connects directly to educational platforms (Canvas, Google Classroom, Microsoft Teams, Moodle, and more), automatically syncs courses, modules, assignments, grades, files, and calendar events, and presents everything in a clean, unified interface.

---

## Quick start

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```bash
# 1. Clone and install
git clone <repo>
cd student-hub
npm install           # also runs electron-rebuild for better-sqlite3

# 2. Configure OAuth credentials
cp .env.example .env
# Edit .env and fill in your OAuth client IDs

# 3. Start in development mode
npm run dev
```

---

## OAuth setup

Each integration requires a registered OAuth application.

### Canvas

1. Go to your institution's Canvas admin panel → **Developer Keys** → **+ Developer Key** → **API Key**
2. Set **Redirect URI** to `student-hub://oauth/canvas/callback`
3. Enable the scopes your students need (courses, assignments, submissions, files)
4. Copy the **Client ID** to `CANVAS_CLIENT_ID` in `.env`
5. Set `CANVAS_CLIENT_SECRET` (required for non-PKCE Canvas flow)

### Google (Classroom + Calendar)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → **APIs & Services** → **Credentials** → **Create OAuth 2.0 Client ID**
3. Application type: **Desktop app**
4. Add `student-hub://oauth/google/callback` as an authorized redirect URI
5. Enable the **Google Classroom API** and **Google Calendar API**
6. Copy the client ID and secret to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

### Microsoft (Teams EDU + Outlook Calendar)

1. Go to [portal.azure.com](https://portal.azure.com) → **App registrations** → **New registration**
2. Add `student-hub://oauth/microsoft/callback` as a redirect URI (type: **Public client/native**)
3. Under **API permissions**, add: `EduAssignments.Read`, `Calendars.Read`, `User.Read`
4. Copy the **Application (client) ID** to `MICROSOFT_CLIENT_ID`

---

## Architecture

```
student-hub/
├── src/
│   ├── main/                    # Electron main process (Node.js)
│   │   ├── database/            # SQLite via better-sqlite3
│   │   │   ├── schema.ts        # All table definitions
│   │   │   └── repositories/    # Type-safe data access layer
│   │   ├── integrations/        # LMS adapter engine
│   │   │   ├── base/            # Abstract adapter + error types
│   │   │   └── canvas/          # Canvas REST API v1 adapter
│   │   ├── services/
│   │   │   ├── auth/            # OAuth manager + encrypted token store
│   │   │   └── sync/            # Background sync engine
│   │   └── ipc/                 # IPC handler registration
│   │
│   ├── preload/                 # Context bridge (main ↔ renderer)
│   │   └── index.ts             # Typed window.api surface
│   │
│   └── renderer/                # React 18 + TypeScript + Tailwind
│       └── src/
│           ├── store/           # Zustand global state
│           ├── lib/             # IPC client, utilities
│           ├── components/      # Reusable UI components
│           └── pages/           # Route-level page components
│
├── shared/                      # Types shared between main and renderer
│   ├── ipc-channels.ts          # All IPC channel name constants
│   └── types/
│       ├── entities.ts          # Course, Module, Assignment, Grade, …
│       └── ipc.ts               # Request/response payload types
```

### Data flow

```
User authenticates in browser
       ↓
deep link → OAuth manager → token store (safeStorage)
       ↓
Sync engine fetches from LMS API
       ↓
Data validation pipeline (fetch → parse → identify → validate → normalize)
       ↓
SQLite database (via repositories)
       ↓
IPC handler returns data to renderer
       ↓
React component renders real data
```

---

## Build phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Project scaffolding — this PR | ✅ Complete |
| 2 | Canvas integration — full sync pipeline | 🔜 Next |
| 3 | Core UI — Dashboard, Courses, Modules, Assignments, Grades | 🔜 |
| 4 | File management — local cache, auto-organisation | 🔜 |
| 5 | Google Classroom + Calendar | 🔜 |
| 6 | Microsoft Teams EDU + Outlook | 🔜 |
| 7 | Notifications — reminders, overdue alerts | 🔜 |
| 8 | Obsidian vault sync | 🔜 |
| 9 | Animations, themes, polish | 🔜 |
| 10 | Packaging, auto-update, production hardening | 🔜 |

---

## Build for distribution

```bash
npm run build:mac    # → dist/*.dmg
npm run build:win    # → dist/*.exe (NSIS installer)
npm run build:linux  # → dist/*.AppImage + *.deb
```

---

## Security model

- **Context isolation ON** — renderer cannot access Node.js
- **Node integration OFF** — `require()` unavailable in renderer
- **Sandbox ON** — renderer process is OS-sandboxed
- **safeStorage** — tokens encrypted with OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret)
- **Custom protocol** — OAuth redirects via `student-hub://` never pass through a web server
- **CSP** — Content-Security-Policy header prevents inline scripts and external resource loading
