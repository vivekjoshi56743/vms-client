# Supervision Client — Frontend Plan

**Status:** Architecture decisions locked. Backend Phase 0–9 complete; frontend build starts now.
**Backend API:** Documented in OpenAPI/Swagger at `localhost:8443/swagger/doc.json`; a local snapshot lives at `docs/swagger.json` and is the input to `npm run generate-api-types`.
**Design system:** Defined in `docs/supervision-visual-system.html` — single source of truth for tokens, colors, components.

---

## 1. Stack — Locked Decisions

| Layer | Choice | Why |
|---|---|---|
| **Shell** | Tauri 2.0 | ~10MB installer, native WebView, auto-updater, code-signing, secure storage |
| **Framework** | React 18 + TypeScript | Largest ecosystem; only framework with shadcn/ui parity; team familiarity |
| **UI Primitives** | shadcn/ui (Radix-based), via `shadcn@2` CLI — **NOT `shadcn@4`** (it targets Tailwind 4 and breaks our token integration) | Source-in-repo components, full styling control, accessibility solved |
| **Styling** | Tailwind CSS configured with design tokens + animations.css for keyframes | Compose utilities from the tokens in `docs/supervision-visual-system.html` |
| **Animation utilities** | `tailwindcss-animate` plugin | Required peer of shadcn + Radix; powers `data-state`-driven animations (`animate-in`, `fade-out-0`, `zoom-in-95`, etc.) used by Dialog, DropdownMenu, Select, Tooltip |
| **Routing** | React Router v6 with HashRouter | Most reliable across all three Tauri WebViews |
| **Server state** | TanStack Query v5 | Caching, refetching, mutations, WebSocket invalidation |
| **Client state** | Zustand | Tiny, no boilerplate, used only for UI state not on the server |
| **Forms** | React Hook Form + Zod | Schema → form validation → TypeScript types in one place |
| **HTTP client** | openapi-fetch (using generated schema) | Type-safe at the API boundary, zero hand-maintained types |
| **Animations** | Motion (formerly Framer Motion) + CSS keyframes | Framer for component transitions, CSS for design-system pulses/shimmers |
| **Video — live** | WHEP (WebRTC) via small WHEP client; hls.js fallback | Backend exposes WHEP URLs from `/api/cameras/:id/stream` |
| **Video — playback** | hls.js wrapping the fMP4 URL from backend | Backend's playback proxy returns one continuous fMP4 |
| **Build tool** | Vite | Standard, fast, integrates with Tauri templates |
| **Testing** | Vitest + React Testing Library + Playwright | Unit / component / end-to-end |
| **Type safety with backend** | `openapi-typescript` v7 against `docs/openapi.json` | Regenerated whenever the API changes — never hand-maintained |
| **OpenAPI conversion** | `swagger2openapi` | Backend emits Swagger 2.0; `openapi-typescript` v7 requires OpenAPI 3.x — script converts at build time |

**Versions to pin (use latest stable in these majors):**
- Tauri 2.x
- React 18.x
- TypeScript 5.x
- TanStack Query v5
- Tailwind CSS 3.x (NOT 4.x — locks us out of `shadcn@2` and our token-mapped `tailwind.config.js`)
- Vite 5.x
- Motion (latest, NOT framer-motion)
- shadcn CLI 2.x (NOT 4.x — see note above)
- openapi-typescript v7 + swagger2openapi (chained in `npm run generate-api-types`)

---

## 2. Project Structure

```
supervision-client/
├── docs/                            Source-of-truth documents (NOT in src/)
│   ├── plan.md                      This file
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
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── toast.tsx (sonner)
│   │   │   ├── tabs.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── card.tsx
│   │   │   └── ...
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

## 3. Architectural Rules (Non-Negotiable)

These rules keep the codebase navigable as it grows. Treat them as load-bearing.

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

---

## 4. Design System Integration

### Token strategy
- Copy CSS variables from `docs/supervision-visual-system.html` into `src/styles/tokens.css`.
- Keep all three theme blocks (`:root[data-theme="light"]`, `[data-theme="dark"][data-mode="standard"]`, `[data-mode="surveillance"]`).
- Reference these in `tailwind.config.js`:

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
        // ... all tokens
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '4px',  // matches design system
        card: '6px',
      },
    }
  }
}
```

### Typography
- **Inter** — all UI text, body, labels, buttons
- **JetBrains Mono** — technical text: timestamps, IPs, camera IDs, status badges, label "eyebrows", code, mono buttons
- Load both via Google Fonts in `index.html` or via `@fontsource` packages

### Component styling pattern
For each shadcn/ui component:
1. Run `npx shadcn-ui add <component>`
2. Open the generated file in `components/ui/`
3. Replace default Tailwind class lists with ones using our tokens
4. Example: `bg-primary` → `bg-ink`, `text-primary-foreground` → `text-text-inverse`
5. Keep the underlying Radix logic untouched

### Required animations (port from design system to `animations.css`)
- `brand-pulse` — logo/brand element
- `live-breathe` — "LIVE" indicator on active streams
- `critical-pulse` — critical alert badges
- `alert-shadow` — critical alert glow
- `shimmer` — loading skeletons
- `spin` — button spinners

---

## 5. Build Order (Incremental Phases)

Each phase is small, testable, independently runnable. Don't move on until the current phase works end-to-end.

### Phase F0 — Project foundation (~1 day)
- Initialize Tauri 2.0 + React + TypeScript + Vite via `create-tauri-app`
- Install Tailwind, configure with placeholder tokens
- Install fonts (Inter + JetBrains Mono)
- Set up ESLint, Prettier, TypeScript strict mode
- Verify build runs in both dev (`npm run tauri dev`) and prod (`npm run tauri build`)
- **Done when:** "Hello World" Tauri window opens on Win/Mac/Linux

### Phase F1 — Design tokens + Tailwind integration (~1 day)
- Copy `tokens.css` from `docs/supervision-visual-system.html`
- Copy `animations.css` (keyframes only)
- Configure Tailwind to reference CSS variables
- Build a `/playground` route showing all colors, all button variants, all input states
- Verify all three themes work via `data-theme` toggle
- **Done when:** the playground page faithfully reproduces the design system samples

### Phase F2 — shadcn/ui + design system marriage (~2 days)
- Install shadcn/ui, configure with `components.json`
- Add components one at a time: Button, Input, Label, Dialog, DropdownMenu, Select, Tabs, Badge, Card, Toast (sonner), Tooltip
- For each: replace default classes with design-system tokens
- Add them to the playground for visual verification
- **Done when:** every primitive matches the design system across all three themes

### Phase F3 — API client + type generation (~1 day)
- Add scripts: `npm run generate-api-types` (calls openapi-typescript)
- Set up `api/client.ts` using openapi-fetch with the generated schema
- Wire up auth header injection (reads from Zustand store)
- Set up TanStack Query provider in `App.tsx`
- Create `useAuth` hook with login/logout/me
- **Done when:** can call `/healthz` from a test page and see typed response

### Phase F4 — Login flow + auth (~2 days)
- Build `LoginPage` with React Hook Form + Zod validation
- Store session token in Zustand + Tauri secure storage (Stronghold or OS keychain via Tauri plugin)
- Build `useAuth` hook properly with login/logout mutations
- Add auth guard: redirect to `/login` if not authenticated
- Build TOFU certificate fingerprint trust dialog (one-time prompt on first server connect)
- **Done when:** login → redirected to dashboard, refresh keeps session, logout clears it

### Phase F5 — App shell (~1 day)
- Build `AppShell` with sidebar + topbar + main pane
- Theme switcher in topbar
- Navigation: Dashboard, Live, Playback, Cameras, Health, Settings
- Sidebar collapse persisted to Zustand → localStorage
- **Done when:** all navigation works, layout matches design system

### Phase F6 — Camera list and add (~2-3 days)
- `CamerasPage` lists cameras using `useCameras` hook
- `CameraCard` shows name, status badge, RTSP URL (mono font), driver type
- `AddCameraDialog` with form: name, RTSP URL, username, password
- `useAddCamera` mutation with optimistic update + toast on success/error
- Camera health badges using `useCameraHealth`
- Delete with confirmation dialog
- **Done when:** can add a real camera, see it in the list, delete it, all with correct loading/error states

### Phase F7 — Live view, single camera (~3-4 days)
- Build `VideoPlayer` component that:
  - Accepts a URL
  - Detects WHEP/HLS/native based on URL pattern
  - Connects via WHEP for live, hls.js for HLS, native `<video>` for direct mp4
  - Shows loading state, error state, retry button
- `LivePage` shows a single camera fullscreen first (simplest case)
- Fetch stream URLs via `useStream(cameraId)`
- Live badge overlay using `live-breathe` animation
- Camera name + status overlaid as video chrome (using `--video-chrome-*` tokens)
- **Done when:** click a camera, see live video with <1s latency on LAN

### Phase F8 — Live grid (~2-3 days)
- `VideoGrid` component: 1×1, 2×2, 3×3, 4×4
- Layout selector in topbar
- Camera selector per slot (or auto-fill from camera list)
- Saved layout persistence in Zustand → backend (later)
- Auto-degrade: when grid > 9, request sub-stream URLs
- **Done when:** can view 16 cameras at once with stable performance

### Phase F9 — Playback (~3-4 days)
- `PlaybackPage` with camera selector + date/time picker
- Call `useCameraPlayback(cameraId, start, end)` to get fMP4 URL
- Mount in `VideoPlayer` (hls.js with the fMP4 URL)
- Playback controls: play/pause, seek, speed (0.5x, 1x, 2x, 4x, 8x, 16x)
- Timeline scrubber showing date range
- (Phase F11 will add event markers to the timeline)
- **Done when:** can pick a camera + time range, see recorded video, seek within it

### Phase F10 — Health monitoring view (~1-2 days)
- `HealthPage` shows per-camera health + system health
- Polls every 5s via TanStack Query refetchInterval
- Status badges with `status-online`, `status-warning`, `status-critical` colors
- Last-seen timestamps, error messages (in mono font)
- **Done when:** disconnect a camera → see it go offline in the UI within 90s

### Phase F11 — User management (~2 days)
- `UsersPage` (admin only) — list users, roles, add/delete
- Change password form
- TOTP enrollment flow (QR code via library like `qrcode.react`)
- Role-aware UI: hide buttons/pages from Viewers
- **Done when:** can create a Viewer user, log in as them, confirm they can't add cameras

### Phase F12 — WebSocket live events (~2 days, requires backend Phase 11)
- `useWebSocket` hook that connects to `/api/events/ws` with auth token
- Events invalidate relevant TanStack Query caches (e.g., camera health → invalidate `['cameras', id, 'health']`)
- Toast for critical events
- Sidebar event feed (collapsible)
- **Done when:** disconnect a camera → toast appears, health view updates without refresh

### Phase F13 — Polish & hardening (open-ended)
- Empty states with design-system illustrations
- Skeleton loaders everywhere (using `shimmer`)
- Error boundaries on every page
- Tauri native menus (File/View/Help)
- Auto-updater integration via Tauri
- Code-signing for Windows and macOS
- Onboarding wizard for first-run
- Cross-platform smoke testing
- Performance pass: a 16-camera grid should sustain 25fps total without dropped frames

---

## 6. Specific Patterns and Conventions

### Pattern: API function + hook + component

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

### Pattern: Zustand store

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

### Pattern: Form

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

## 7. Things That Are NOT in V1 of the Client (Be Disciplined)

To match backend V1 scope:
- ❌ Incident management
- ❌ Evidence export
- ❌ Surveillance mode tour and event-driven view switching (deferred to V1.5)
- ❌ PTZ controls (interface stubbed, no UI until backend supports it)
- ❌ AI detection visualization
- ❌ Multi-server federation (UI shows one server at a time in V1)
- ❌ Mobile/responsive (desktop-only)
- ❌ Map / floor plan views
- ❌ Two-way audio UI

If a feature is in this list and someone asks for it, the answer is: "after V1 ships."

---

## 8. Performance Budgets

Treat these as hard targets:
- App launch (cold start) to interactive: < 2s
- Login to dashboard render: < 500ms after backend response
- Live view (single camera) first frame: < 3s on LAN
- 16-camera grid: sustains 25fps total, no dropped frames, < 60% CPU on reference hardware
- Playback seek: < 500ms to first frame at new position
- Bundle size (after build): < 5MB JS, < 500KB CSS

If any of these regress, fix before moving on.

---

## 9. Cross-Platform Testing Discipline

Test on all three platforms regularly, NOT just at the end:
- Windows 10/11 (WebView2 — Chromium-based, fewest issues)
- macOS 12+ (WKWebView — strict CSP, watch for codec issues)
- Ubuntu 22.04+ (WebKitGTK — weakest, watch for WebRTC issues)

Spin up Tauri build on each platform at least once a phase. Cross-platform bugs caught early are cheap; caught late they're catastrophic.

---

## 10. The Discipline That Matters Most

**Don't shortcut the interfaces. Shortcut the implementations.**

Build the api → hooks → components layering even when the page is trivial. Use shadcn primitives even when raw HTML would be faster. Generate API types even when copying them by hand would take 30 seconds.

The cost of these abstractions in V1 is small. The cost of NOT having them when V1.5 lands with PTZ, incidents, surveillance mode, and multi-server federation is enormous refactoring.

Build the right shape from day one. Ship the simplest implementation inside that shape.

---

## 11. Deferred Technical Work (post-V1 backlog)

Items discovered during V1 development that are deliberately deferred. Each entry records the root cause, what was shipped as the interim solution, and exactly what both sides need to do to fully resolve it.

---

### TD-001 — H.265 camera support on Linux / full WebRTC support for H.265 cameras

**Status:** Deferred. Partially mitigated client-side.

**Root cause:**
WebRTC (WHEP) only supports H.264, VP8, VP9, and AV1. H.265 (HEVC) is excluded from the WebRTC spec entirely due to patent licensing issues. MediaMTX returns `400 — the stream doesn't contain any supported codec` when a WHEP offer arrives for an H.265 source.

Additionally, H.265 in HLS (via fMP4 container) is only hardware-decodable on macOS (WKWebView) and Windows (WebView2/Chromium). **WebKitGTK (Linux Tauri target) has no H.265 decoder** — H.265 cameras will show a black screen on Linux even if the HLS request succeeds.

**What is shipped (interim):**
- `connectWhep` in `src/lib/whep.ts` tags 400 responses that mention "codec" with `err.whepUnsupportedCodec = true`.
- `VideoPlayer` / `WhepPlayer` detect that flag and silently switch to `hlsFallback` (the HLS URL) without showing an error overlay to the user.
- `LivePage` always passes both `url` (WHEP preferred) and `hlsFallback` (HLS) to `VideoTile`.
- Result: H.264 cameras → WHEP (<500ms latency). H.265 cameras → auto-fallback to HLS (~2-3s latency) on macOS/Windows. Linux: H.265 cameras are broken (black screen).

**Server-side work needed (Go backend + MediaMTX):**
1. Add an optional FFmpeg transcoding pipeline in `mediamtx.yml`. When a camera is registered with `codec: h265` (or auto-detected), configure a `runOnReady` hook that re-encodes the RTSP source to H.264 before MediaMTX ingests it:
   ```yaml
   paths:
     cam-~:
       runOnReady: ffmpeg -i rtsp://localhost:8554/${MTX_PATH}
                         -vcodec libx264 -preset ultrafast -tune zerolatency
                         -f rtsp rtsp://localhost:8554/${MTX_PATH}-h264
   ```
2. Expose a `codec` field in the `POST /api/cameras/{id}/stream` response so the client can pick the right protocol upfront without attempting WHEP and eating a round-trip failure.
3. Alternatively: configure MediaMTX `webrtcEncodeH265: true` if/when MediaMTX ships H.265-over-WebRTC support (tracked upstream: mediamtx/mediamtx#issues).

**Client-side work needed:**
1. In `src/api/streams.ts` / `StreamURLs`, add `codec?: "h264" | "h265" | null` once the backend exposes it.
2. In `src/pages/LivePage.tsx` (and future `VideoGrid`), use `codec` to skip the WHEP attempt entirely for H.265 cameras rather than relying on the error-based fallback:
   ```ts
   const videoUrl = (stream.data?.codec === "h265")
     ? stream.data.hls
     : stream.data?.webrtc ?? stream.data?.hls ?? null;
   ```
3. On Linux (detect via `navigator.platform` or Tauri OS API), warn the user if an H.265 camera is selected and no transcoded H.264 stream is available, instead of silently showing black.

**Performance note:** FFmpeg transcoding H.265 → H.264 costs roughly 1 CPU core per 1080p stream at `ultrafast` preset. Plan server hardware accordingly for large camera counts.

---

### TD-002 — Low Latency HLS (LL-HLS) for H.265 cameras

**Status:** Deferred. Standard HLS currently ships (~2-3s latency).

**Root cause:**
H.265 cameras fall back to HLS (see TD-001). Standard HLS has 2-6s latency because the player must buffer at least one full segment. MediaMTX supports Low Latency HLS (partial segments, ~200ms chunks), which brings latency to ~1-2s, but it must be explicitly enabled.

**What is shipped (interim):**
hls.js is configured with aggressive catch-up settings (`liveSyncDuration: 1`, `liveMaxLatencyDuration: 4`, `maxBufferLength: 4`) to minimise drift, but the floor is still ~2-3s because MediaMTX emits full 2s segments by default.

**Server-side work needed:**
Enable LL-HLS in `mediamtx.yml`:
```yaml
hls:
  llhls: yes
  segmentDuration: 1s      # reduce from default 2s
  partDuration: 200ms      # partial segment size for LL-HLS
  segmentCount: 3
```

**Client-side work needed:**
None — hls.js `lowLatencyMode: true` (already set in `HlsPlayer`) automatically detects and uses LL-HLS playlists when the server advertises them. No code changes required once the server is configured.

**Expected result after server change:** ~1-2s latency for H.265 cameras on macOS/Windows.

---

## 12. UI Overhaul — Align to Mockup (supervision-mockup.vercel.app)

The visual reference mockup was reviewed and fully extracted on 2026-05-15. All component dimensions, token values, and layout patterns have been saved to memory (`reference_mockup_design_system.md`). This section documents every delta between the current implementation and the mockup, prioritised into implementation tasks.

**Mockup URL:** https://supervision-mockup.vercel.app/  
**Token status:** `src/styles/tokens.css` already matches the mockup exactly. Only additive changes needed.

---

### UI-001 — Add missing CSS tokens (server color-coding)

**Priority:** High — needed by Dashboard "Connected servers" section and future multi-server views.

**Changes to `src/styles/tokens.css`:**
Add `--server-1`, `--server-2`, `--server-3` to all three theme blocks:

```css
/* Light */
--server-1: #0891B2;
--server-2: #A855F7;
--server-3: #F59E0B;

/* Dark standard + surveillance */
--server-1: #22D3EE;
--server-2: #C084FC;
--server-3: #FBBF24;
```

**Changes to `tailwind.config.js`:** Map to `server-1`, `server-2`, `server-3` utility classes.

---

### UI-002 — Sidebar rebuild

**Priority:** High — visible on every page.

**Dimensions:** Width → 228px (currently 220px). Keep 56px collapsed.

**Brand mark changes:**
- "Super" in `text-text-primary` bold + "vision" in `text-accent` (cyan) — two-tone wordmark
- Small pulsing dot after the wordmark: `--status-online` with `brand-live-pulse` animation
- Remove current icon-only brand mark, replace with the two-tone text

**Nav structure — add section groups:**
```
OPERATIONS        ← mono 10px 600 uppercase tracking-[0.1em] text-tertiary, py-3 px-5
  Home            ← /dashboard, LayoutDashboard icon
  Live            ← /live, Video icon
  Playback        ← /playback, Film icon
  Events          ← /events, Bell icon + red count badge (stub: 0)
  Incidents       ← /incidents, Shield icon + red count badge (stub: 0)

INFRASTRUCTURE
  Health          ← /health, Activity icon + red count badge from useAllCameraHealth
  Audit log       ← /audit, FileText icon (stub page, redirect to dashboard)

MANAGE
  Cameras         ← /cameras, Camera icon
  Users & roles   ← /settings/users, Users icon
  Connections     ← /settings, Plug icon
```

**Active state:** `bg-accent-subtle text-accent-text font-medium` (currently `bg-surface text-text-primary`)

**Count badges:** Inline `<span>` pill — `bg-status-critical text-white font-mono text-[10px] rounded-full px-1.5 min-w-[18px] text-center`. Live badge count for Health comes from `useAllCameraHealth` counting offline/degraded cameras. Events/Incidents are stubs returning 0 until backend events API (Phase F11/F12).

**Collapsed state:** Section labels hidden, badges shown as dots on icons.

---

### UI-003 — TopBar rebuild

**Priority:** High — visible on every page.

**Height:** 52px (currently h-16 = 64px).

**Layout (left → right):**
1. **Left slot:** page title (keep existing slot — used by page actions)
2. **Center:** Search bar — `width: 300px, max-w-[40vw]`, `h-8`, `bg-surface-input border border-border rounded`, left Search icon (16px, text-tertiary), right `kbd` badge showing `⌘K` — stub (no actual search in V1, just visual)
3. **Right slot (gap-2):**
   - Camera status pill — `inline-flex items-center gap-1.5 h-7 px-3 rounded bg-status-critical-subtle border border-status-critical/30 font-mono text-[11px] text-status-critical` — shows count of offline cameras from `useAllCameraHealth`. Hidden when all online.
   - Theme toggle (keep existing icon button)
   - Bell icon button (stub, no action)
   - User pill — `inline-flex items-center gap-2 h-8 px-2 rounded hover:bg-surface cursor-pointer` — avatar circle (initials, cyan gradient `from-accent to-accent-active`) + username from `useAuthStore`

---

### UI-004 — VideoTile chrome redesign

**Priority:** High — core VMS experience.

**Current chrome:** camera name top-left, LIVE badge top-right, health dot bottom-left.

**Mockup chrome:**

Top-left pill (`.video-camera-tag`):
```
[status-dot] [CAMERA_NAME] [LOCATION_BADGE]
```
- Status dot: 6px circle, `bg-video-online-dot` or `bg-video-offline-dot`
- Camera name: JetBrains Mono 11px 600 uppercase
- Location badge: tiny pill `bg-accent-subtle text-accent-text font-mono text-[9px]` showing `camera.driver_type` or a location tag (use `camera.name` suffix if it contains `_` — e.g. `N_BR_ENTRANCE` → `N.BR`)
- Container: `bg-video-chrome-bg backdrop-blur-sm border border-video-chrome-border rounded-[3px] px-2 py-0.5`

Top-right: timestamp pill
- Current time (updates every second) — `HH:mm:ss` in JetBrains Mono 10.5px 500
- Same pill style as camera tag

Bottom-left: REC badge
- `bg-video-chrome-bg border border-video-chrome-border rounded-[2px] px-1.5 py-0.5 inline-flex gap-1.5 items-center`
- 5px red dot + "REC" text font-mono 10px — always shown when `playerState === "playing"`

Bottom-right: expand icon (stub — no fullscreen in V1, just visual)

Corner brackets (all 4):
- `absolute 6px from respective corner`
- `12×12 border-[rgba(244,244,245,0.59)]`
- Top-left: `border-t border-l`, top-right: `border-t border-r`, etc.
- On critical health: brackets and tile border turn `--status-critical`

**Also:** Remove standalone `LiveBadge` from top-right — timestamp replaces it. LIVE state is implied by the stream playing.

**New `VideoTile` props needed:**
- `showRec?: boolean` — default true when playing
- `alertLevel?: "warning" | "critical" | null` — drives corner bracket color + tile border

---

### UI-005 — VideoGrid + LivePage layout rebuild (Phase F8)

**Priority:** High — next phase.

This is the F8 VideoGrid work, now with the full mockup spec:

**Left panel (`LayoutsPanel`, ~260px fixed):**
- "Layouts" heading + count badge
- Search input (stub)
- Scrollable list of `LayoutCard` components:
  - Preview thumbnail (CSS grid of colored squares)
  - Layout name + active indicator
  - Sub-text: `{cols}×{rows} · {n} cameras · location`
  - Click to select
- "+ NEW LAYOUT" button (stub in V1 — just creates a default 2×2)

**Layout data:** Zustand store (`src/stores/ui.ts` — extend or create `src/stores/layouts.ts`):
```ts
type GridSize = "1x1" | "2x2" | "3x3" | "4x4"
type Layout = { id: string; name: string; size: GridSize; slots: (string | null)[] }
```
Persist in localStorage. Pre-populate with one default layout using all cameras.

**Grid selector pills (top-right of main area):**
`1×1 | 2×2 | 3×3 | 4×4` — active: `bg-accent-subtle text-accent-text`, inactive: `bg-surface text-text-secondary border border-border`

**Surveillance button:** Triggers `setTheme("dark-surveillance")` — exists in UIStore already.

**VideoGrid component (`src/components/video/VideoGrid.tsx`):**
- Accepts `size: GridSize` + `slots: (string | null)[]` (camera IDs or null)
- Renders CSS grid with gap-1
- Each slot: if camera ID → `<VideoTile>` with stream; if null → `<EmptySlot>` with click-to-assign
- `EmptySlot`: dark bg, camera-off icon, "Click to assign" text

**Camera assignment:** Click empty slot → small popover with camera list → select → store slot assignment.

**Pagination:** `Page X of Y · 1-N of N cameras` footer — shown when camera count exceeds slots.

**Done when:** Can view a 3×3 grid of 9 cameras simultaneously.

---

### UI-006 — DashboardPage rebuild

**Priority:** Medium — after F8.

Replace current stub with the full mockup layout:

**Sections:**
1. **Greeting**: "Good afternoon, {username}" — Inter 30px 600. Use time-of-day logic (morning/afternoon/evening).
2. **Pinned cameras strip**: `PINNED CAMERAS · N OF TOTAL` eyebrow + Edit. Row of camera tiles (horizontal scroll, fixed height 160px). "Pin" concept = first N cameras from list for V1 (no pin API yet — stub with first 4).
3. **Stats row** (4 cards, equal-width):
   - **Cameras Online**: count from `useAllCameraHealth` — online vs total
   - **NVRs Online**: stub "1 / 1" in V1 (no NVR API)
   - **Recording**: count recording-enabled cameras from `useCameras`
   - **Open Incidents**: stub "0" in V1 (no incidents API)
   - Each card: eyebrow label + big number (JetBrains Mono 42px) + trend sub-line
4. **Activity feed**: "SINCE YOUR LAST VISIT" — stub with 1-2 static items in V1; replace with real events in Phase F12.
5. **Connected servers**: single server card showing server URL, camera count, uptime (from `useAllCameraHealth`). Server color: `--server-1`.

---

### UI-007 — Splash / loading screen

**Priority:** Low — polish only, does not affect function.

The mockup has a branded splash screen shown at cold start (before the React app renders or during `AuthInitializer` loading).

**Implementation:** In `App.tsx`, while `AuthInitializer` has `ready === false`, render a full-screen splash:
- Dark `bg-canvas-deep` background with 24px dot grid pattern (CSS `radial-gradient`)
- "**Super**<span accent>vision</span>" wordmark at 60px — floating animation
- Orbital ring animation (pure CSS, no canvas) with 6 camera icons
- Progress bar `bg-accent h-[2px]` animating from 0→100% over ~1.5s
- "CONNECTING" label + status text below bar
- "ESTABLISHING LIVE FEEDS" footer

---

### Implementation Order

```
UI-001  tokens (15 min)          → do immediately, no visual risk
UI-002  Sidebar (2h)             → section groups, active state, brand
UI-003  TopBar (1.5h)            → search stub, camera pill, user pill
UI-004  VideoTile chrome (2h)    → timestamp, REC, corner brackets
UI-005  VideoGrid + LivePage (1 day)  → F8, the next phase
UI-006  Dashboard (half day)     → F9 UI, after F8
UI-007  Splash (1h)              → last, pure polish
```

Total estimated: ~2 days of focused work across UI-001 through UI-006.
