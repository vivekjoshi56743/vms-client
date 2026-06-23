# CLAUDE.md — Supervision Client

> **Read this file before every action. The rules here are load-bearing — do not violate them.**

This file is the durable instruction set for the Supervision Client frontend project. It is the persistent contract between sessions. If anything in this file conflicts with a request, surface the conflict — do not silently break the rules.

Source documents (all authoritative; live in `docs/`):
- `docs/plan.md` — the architecture plan; CLAUDE.md is a distillation of its load-bearing parts.
- `docs/supervision-visual-system.html` — the single source of truth for design tokens, components, themes.
- `docs/swagger.json` — the backend's OpenAPI spec; `npm run generate-api-types` converts it to `docs/openapi.json` (gitignored) and writes types to `src/api/schema.ts`. Never hand-edit the schema.
- `docs/video-streaming-architecture.md` — the LIVING source of truth for how live + playback select codecs, transcode, route through Rust, and apply the `hev1→hvc1` retag. Keep it in sync (see Rule 9).

The backend is a Go-based self-hosted VMS, complete through Phase 9 (live streaming, recording, playback, health monitoring). The frontend is a Tauri 2.0 desktop app, starting now.

---

## 1. Stack (locked decisions)

| Layer | Choice | Why |
|---|---|---|
| **Shell** | Tauri 2.0 | ~10MB installer, native WebView, auto-updater, code-signing, secure storage |
| **Framework** | React 18 + TypeScript | Largest ecosystem; only framework with shadcn/ui parity; team familiarity |
| **UI Primitives** | shadcn/ui (Radix-based), via `shadcn@2` CLI — **NOT `shadcn@4`** (targets Tailwind 4 and breaks our token integration) | Source-in-repo components, full styling control, accessibility solved |
| **Styling** | Tailwind CSS configured with design tokens + animations.css for keyframes | Compose utilities from the tokens in `docs/supervision-visual-system.html` |
| **Animation utilities** | `tailwindcss-animate` plugin | Required peer of shadcn + Radix; powers `data-state`-driven animations (`animate-in`, `fade-out-0`, `zoom-in-95`, etc.) used by Dialog, DropdownMenu, Select, Tooltip |
| **Routing** | React Router v6 with HashRouter | Most reliable across all three Tauri WebViews |
| **Server state** | TanStack Query v5 | Caching, refetching, mutations, WebSocket invalidation |
| **Client state** | Zustand | Tiny, no boilerplate, used only for UI state not on the server |
| **Forms** | React Hook Form + Zod | Schema → form validation → TypeScript types in one place |
| **HTTP client** | openapi-fetch (using generated schema) | Type-safe at the API boundary, zero hand-maintained types |
| **Animations** | Motion (formerly Framer Motion) + CSS keyframes | Motion for component transitions, CSS for design-system pulses/shimmers |
| **Video — live** | WHEP (WebRTC) via small WHEP client; hls.js fallback | Backend exposes WHEP URLs from `/api/cameras/:id/stream` |
| **Video — playback** | hls.js wrapping the fMP4 URL from backend | Backend's playback proxy returns one continuous fMP4 |
| **Build tool** | Vite | Standard, fast, integrates with Tauri templates |
| **Testing** | Vitest + React Testing Library + Playwright | Unit / component / end-to-end |
| **Type safety with backend** | `openapi-typescript` v7 against `docs/openapi.json` | Regenerated whenever the API changes — never hand-maintained |
| **OpenAPI conversion** | `swagger2openapi` | Backend emits Swagger 2.0; openapi-typescript v7 requires OpenAPI 3.x — script converts at build time |

**Versions to pin (latest stable in these majors):** Tauri 2.x · React 18.x · TypeScript 5.x · TanStack Query v5 · **Tailwind CSS 3.x** (NOT 4.x) · Vite 5.x · Motion (NOT framer-motion) · **shadcn CLI 2.x** (NOT 4.x) · openapi-typescript v7 + swagger2openapi (chained in `npm run generate-api-types`).

---

## 2. Project structure

```
supervision-client/
├── docs/                            Source-of-truth documents (NOT in src/)
│   ├── plan.md                      Architecture plan
│   ├── supervision-visual-system.html  Design system (tokens, components)
│   ├── swagger.json                 Backend OpenAPI (Swagger 2.0) snapshot
│   └── openapi.json                 Generated 3.0 conversion (gitignored)
│
├── src-tauri/                       Rust shell (Tauri-generated, mostly untouched)
│   ├── src/
│   ├── tauri.conf.json              CSP, window config, updater config
│   └── icons/
│
├── src/                             React frontend
│   ├── main.tsx                     Entry point; mounts <App />
│   ├── App.tsx                      Router + provider tree (QueryClient, Theme)
│   │
│   ├── styles/
│   │   ├── tokens.css               CSS variables from supervision-visual-system.html
│   │   ├── animations.css           Keyframes: brand-pulse, live-breathe, critical-pulse, shimmer
│   │   └── global.css               Base styles, font imports (Inter, JetBrains Mono)
│   │
│   ├── api/                         Pure functions — NO React in here
│   │   ├── client.ts                openapi-fetch instance, auth header injection
│   │   ├── schema.ts                Generated from swagger.json — DO NOT EDIT
│   │   ├── auth.ts                  login(), logout(), me()
│   │   ├── cameras.ts               getCameras(), getCamera(), addCamera(), deleteCamera(), patchCamera()
│   │   ├── recordings.ts            getRecordings(), getRecordingPlayback(), deleteRecording()
│   │   ├── playback.ts              getCameraPlayback(start, end)
│   │   ├── streams.ts               ensureStream(cameraId)
│   │   └── health.ts                getCameraHealth(), getAllCameraHealth()
│   │
│   ├── hooks/                       TanStack Query hooks — components consume these
│   │   ├── useCameras.ts            useCameras, useCamera, useAddCamera, useDeleteCamera
│   │   ├── useRecordings.ts
│   │   ├── usePlayback.ts
│   │   ├── useStream.ts
│   │   ├── useHealth.ts
│   │   ├── useAuth.ts
│   │   └── useWebSocket.ts          Subscribes to live events (Phase 11 of backend)
│   │
│   ├── stores/                      Zustand — client-only state
│   │   ├── auth.ts                  current user, session token (mirror to Tauri secure store)
│   │   ├── ui.ts                    theme, sidebar collapsed, current grid layout
│   │   ├── servers.ts               list of connected servers (future multi-server)
│   │   └── playback.ts              current playback time, speed, selected cameras
│   │
│   ├── components/
│   │   ├── ui/                      shadcn/ui primitives — styled with our tokens
│   │   ├── video/                   Video components — the most complex domain
│   │   │   ├── VideoPlayer.tsx      Unified: picks WHEP/HLS/fMP4 by URL type
│   │   │   ├── VideoTile.tsx        Single tile with chrome overlay (status dot, name)
│   │   │   ├── VideoGrid.tsx        1×1, 2×2, 3×3, 4×4 layouts
│   │   │   └── LiveBadge.tsx        The "LIVE" indicator with live-breathe animation
│   │   ├── camera/
│   │   │   ├── CameraList.tsx
│   │   │   ├── CameraCard.tsx
│   │   │   ├── CameraHealthBadge.tsx
│   │   │   ├── AddCameraDialog.tsx
│   │   │   └── CameraSettingsForm.tsx
│   │   ├── playback/
│   │   │   ├── Timeline.tsx         Scrubber with event markers
│   │   │   ├── DateTimePicker.tsx
│   │   │   └── PlaybackControls.tsx Play/pause/speed/seek
│   │   ├── layout/
│   │   │   ├── AppShell.tsx         Sidebar + topbar + main pane
│   │   │   ├── Sidebar.tsx
│   │   │   └── TopBar.tsx
│   │   └── auth/
│   │       ├── LoginForm.tsx
│   │       └── TOFUDialog.tsx       Certificate fingerprint trust dialog
│   │
│   ├── pages/                       Route-level composition
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx        Server overview, health summary
│   │   ├── LivePage.tsx             Live grid
│   │   ├── PlaybackPage.tsx         Recording playback with timeline
│   │   ├── CamerasPage.tsx          Camera list + add/edit
│   │   ├── HealthPage.tsx           Detailed health view
│   │   └── settings/
│   │       ├── UsersPage.tsx
│   │       └── SystemPage.tsx
│   │
│   ├── lib/
│   │   ├── time.ts                  RFC3339 helpers, duration parsing
│   │   ├── fingerprint.ts           TOFU cert fingerprint storage/verification
│   │   ├── cn.ts                    className merger (clsx + tailwind-merge)
│   │   └── format.ts                Bytes, durations, dates for display
│   │
│   └── types/
│       ├── grid.ts                  Layout types
│       └── playback.ts              Playback state types
│
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.js               Reads CSS variables from tokens.css
├── vite.config.ts
├── components.json                  shadcn/ui config
└── README.md
```

---

## 3. Architectural rules — NON-NEGOTIABLE

These rules keep the codebase navigable as it grows. Treat them as load-bearing. They are stated verbatim from `plan.md`.

### Rule 1: Layer boundaries are one-way
- `pages/` may import from `components/`, `hooks/`, `stores/`, `lib/`
- `components/` may import from `components/ui/`, `hooks/`, `stores/`, `lib/`
- `hooks/` may import from `api/`, `stores/`, `lib/`
- `api/` may import from `lib/` only
- **Never** import upward (a hook does not import a component; an api function does not import a hook).

### Rule 2: Components never call fetch directly
- Components consume data via `hooks/`.
- Hooks wrap `api/` functions in TanStack Query.
- This makes loading/error/cache behavior consistent everywhere.

### Rule 3: API types are generated, not written
- Run `npm run generate-api-types` after any backend API change.
- The script converts `docs/swagger.json` (Swagger 2.0) → `docs/openapi.json` (OpenAPI 3.0) via `swagger2openapi`, then writes `src/api/schema.ts` via `openapi-typescript`.
- Never hand-edit `src/api/schema.ts`. Never hand-edit `docs/openapi.json` either — it's gitignored and regenerated.

### Rule 4: Design tokens are the only source of color/spacing values
- No hardcoded hex colors anywhere in components.
- No hardcoded pixel values for the design-system spacing scale.
- Everything goes through CSS variables defined in `tokens.css`, exposed to Tailwind via `tailwind.config.js`.

### Rule 5: Three themes work via `data-theme` and `data-mode` on `<html>`
- `data-theme="light"` (default)
- `data-theme="dark" data-mode="standard"` (dark)
- `data-theme="dark" data-mode="surveillance"` (surveillance fullscreen mode)
- Theme switching is one Zustand action: `setTheme(mode)`.

### Rule 6: Client and server state are separate
- Server state (anything on the backend): TanStack Query only.
- Client state (UI preferences, current selections): Zustand only.
- Never duplicate server data into Zustand stores.

### Rule 7: All forms use React Hook Form + Zod
- Schema defined once in `lib/schemas/` (or inline if small).
- Schema generates TypeScript types via `z.infer<>`.
- Validation messages match design system error styling.

### Rule 8: Loading and error states are explicit and consistent
- Use design-system skeleton patterns (with `shimmer` animation from tokens.css).
- Errors render via toast (`sonner` from shadcn) for actions, inline for forms.
- Never show a blank screen during loading.

### Rule 9: The video streaming architecture doc is kept in sync
- `docs/video-streaming-architecture.md` describes how live + playback choose codecs, when/where we transcode (`vcodec=h264`), the per-camera observe-and-verify decision (`stores/liveCodec.ts`, `stores/playbackCodec.ts`, `lib/verify-video.ts`), WHEP/HLS selection, the Rust routing, and the `hev1→hvc1` retag in `src-tauri/src/lib.rs`.
- **Whenever you change any of that behavior, update that doc in the SAME commit.** Treat the doc and the code as one change — a video-path change without a doc update is incomplete.
- Update the **"Current as of commit"** stamp at the top of that doc to the commit that makes the change (the doc is then known-accurate up to that commit).

---

## 4. Design system integration

### Token strategy
- All CSS variables come from `docs/supervision-visual-system.html`, copied into `src/styles/tokens.css`.
- Keep all three theme blocks intact: `:root, [data-theme="light"]`, `[data-theme="dark"][data-mode="standard"]`, `[data-mode="surveillance"]`.
- Reference them in `tailwind.config.js` so utilities like `bg-canvas`, `text-text-primary`, `bg-status-online` map to CSS variables. Map every token, not a subset.

Reference shape:
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        'canvas-raised': 'var(--canvas-raised)',
        surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        ink: 'var(--ink)',
        accent: 'var(--accent)',
        'accent-bright': 'var(--accent-bright)',
        'status-online': 'var(--status-online)',
        'status-warning': 'var(--status-warning)',
        'status-critical': 'var(--status-critical)',
        // ... all tokens from tokens.css
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '4px',
        card: '6px',
      },
    }
  }
}
```

### Typography
- **Inter** — all UI text, body, labels, buttons.
- **JetBrains Mono** — technical text: timestamps, IPs, camera IDs, status badges, label "eyebrows", code, mono buttons.
- Load both via `@fontsource/inter` and `@fontsource/jetbrains-mono` imported in `global.css`.

### Required animations (port from design system to `animations.css`)
- `brand-pulse` — logo/brand element
- `live-breathe` — "LIVE" indicator on active streams
- `critical-pulse` — critical alert badges
- `alert-shadow` — critical alert glow
- `shimmer` — loading skeletons
- `spin` — button spinners

### Component styling pattern (for each shadcn primitive)
1. `npx shadcn@latest add <component>`
2. Open the file in `components/ui/`
3. Replace default Tailwind class lists with token-backed classes
4. Common substitutions: `bg-primary` → `bg-ink`, `text-primary-foreground` → `text-text-inverse`, `bg-destructive` → `bg-status-critical`, `bg-secondary` → `bg-surface`, `bg-muted` → `bg-surface`, `ring-ring` → `ring-accent`.
5. Keep Radix logic untouched — only className lists change.

---

## 5. Patterns (copy-paste templates)

### Pattern: API function + hook + page

```ts
// src/api/cameras.ts
export async function getCameras(): Promise<Camera[]> {
  const { data, error } = await client.GET('/api/cameras')
  if (error) throw new APIError(error)
  return data
}

// src/hooks/useCameras.ts
export function useCameras() {
  return useQuery({
    queryKey: ['cameras'],
    queryFn: getCameras,
  })
}

// src/pages/CamerasPage.tsx
export function CamerasPage() {
  const { data: cameras, isLoading, error } = useCameras()
  if (isLoading) return <CameraListSkeleton />
  if (error) return <ErrorState error={error} />
  return <CameraList cameras={cameras} />
}
```

### Pattern: Zustand store (UI/theme)

```ts
// src/stores/ui.ts
type Theme = 'light' | 'dark-standard' | 'dark-surveillance'

interface UIState {
  theme: Theme
  sidebarCollapsed: boolean
  setTheme: (theme: Theme) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'dark-standard',
      sidebarCollapsed: false,
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme',
          theme === 'light' ? 'light' : 'dark')
        document.documentElement.setAttribute('data-mode',
          theme === 'dark-surveillance' ? 'surveillance' : 'standard')
        set({ theme })
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'supervision-ui' }
  )
)
```

### Pattern: Form (RHF + Zod)

```ts
const cameraSchema = z.object({
  name: z.string().min(1, 'Required'),
  rtsp_url: z.string().url('Must be a valid RTSP URL'),
  username: z.string().optional(),
  password: z.string().optional(),
})

type CameraForm = z.infer<typeof cameraSchema>

export function AddCameraDialog() {
  const addCamera = useAddCamera()
  const form = useForm<CameraForm>({ resolver: zodResolver(cameraSchema) })

  const onSubmit = (data: CameraForm) => {
    addCamera.mutate(data, {
      onSuccess: () => {
        toast.success('Camera added')
        form.reset()
      },
      onError: (err) => toast.error(err.message),
    })
  }
  // ...
}
```

---

## 6. Backend API surface (from docs/swagger.json)

Base URL: `https://localhost:8443` (self-signed cert; dev accepts, prod uses TOFU). Auth: Bearer token from `POST /api/auth/login`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Returns `{ token, expires_at }` |
| GET | `/api/auth/me` | Returns current user (id, username, role) |
| GET | `/api/cameras` | List cameras |
| POST | `/api/cameras` | Add camera (admin/owner) |
| GET | `/api/cameras/{id}` | Get camera |
| PATCH | `/api/cameras/{id}` | Update recording settings |
| DELETE | `/api/cameras/{id}` | Delete camera (admin/owner) |
| GET | `/api/cameras/health` | List health for all cameras |
| GET | `/api/cameras/{id}/health` | Health for one camera |
| POST | `/api/cameras/{id}/stream` | Returns `{ webrtc, hls, rtsp, rtmp, srt }` URLs |
| GET | `/api/cameras/{id}/recordings` | List recording segments |
| GET | `/api/cameras/{id}/playback` | Playback URLs for a time range (start/end RFC3339) |
| GET | `/api/recordings/{id}` | (file/playback variants below) |
| GET | `/api/recordings/{id}/file` | Stream raw segment file (Range supported) |
| GET | `/api/recordings/{id}/playback` | Playback URLs for one segment |
| DELETE | `/api/recordings/{id}` | Delete segment (admin/owner) |
| GET | `/healthz` | System health check (unauthenticated) |

Health status enum: `unknown | online | degraded | offline`. Roles: `owner | admin | viewer` (admin/owner can mutate cameras and recordings).

---

## 7. NOT in V1 (binding list)

If a request lands on something in this list, the answer is: **"after V1 ships."** Point at this list and refuse.

- ❌ Incident management
- ❌ Evidence export
- ❌ Surveillance mode tour and event-driven view switching (deferred to V1.5)
- ❌ PTZ controls (interface stubbed, no UI until backend supports it)
- ❌ AI detection visualization
- ❌ Multi-server federation (UI shows one server at a time in V1)
- ❌ Mobile/responsive (desktop-only)
- ❌ Map / floor plan views
- ❌ Two-way audio UI

---

## 8. Performance budgets — hard targets

If any of these regress, fix before moving on.

- App launch (cold start) to interactive: **< 2s**
- Login to dashboard render: **< 500ms** after backend response
- Live view (single camera) first frame: **< 3s** on LAN
- 16-camera grid: sustains **25fps total**, no dropped frames, **< 60% CPU** on reference hardware
- Playback seek: **< 500ms** to first frame at new position
- Bundle size (after build): **< 5MB JS, < 500KB CSS**

---

## 9. Cross-platform testing discipline

Test on all three platforms regularly, NOT just at the end:
- Windows 10/11 (WebView2 — Chromium-based, fewest issues)
- macOS 12+ (WKWebView — strict CSP, watch for codec issues)
- Ubuntu 22.04+ (WebKitGTK — weakest, watch for WebRTC issues)

Spin up Tauri build on each platform at least once a phase.

---

## 10. The discipline that matters most

**Don't shortcut the interfaces. Shortcut the implementations.**

Build the api → hooks → components layering even when the page is trivial. Use shadcn primitives even when raw HTML would be faster. Generate API types even when copying them by hand would take 30 seconds. The cost of these abstractions in V1 is small. The cost of NOT having them when V1.5 lands with PTZ, incidents, surveillance mode, and multi-server federation is enormous refactoring.

Build the right shape from day one. Ship the simplest implementation inside that shape.
