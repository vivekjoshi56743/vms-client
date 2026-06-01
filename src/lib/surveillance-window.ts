import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { isTauri } from "@/lib/fingerprint";

// Opens a layout in a new Surveillance window. In Tauri, this spawns a
// dedicated webview window pointed at the same React bundle with URL
// params telling LivePage to activate the requested layout + surveillance
// theme. In dev-browser fallback we use window.open so testing without
// Tauri still works.
//
// The new window inherits localStorage (Tauri uses a shared store across
// windows of the same app), so the layout already exists in the layouts
// store when the second window mounts.

export async function openSurveillanceWindow(layoutId: string): Promise<void> {
  // Same-document #-route format used by HashRouter.
  const target = `/index.html#/live?surveillance=1&layout=${encodeURIComponent(layoutId)}`;

  if (!isTauri()) {
    // Browser fallback — open as new tab/window. Useful for the Vercel mockup
    // and `npm run dev` without Tauri.
    window.open(target, "_blank", "noopener");
    return;
  }

  // Unique label per call so a second surveillance window can coexist with
  // the first. Tauri requires labels to be unique among open windows.
  const label = `surveillance-${Date.now().toString(36)}`;

  try {
    const win = new WebviewWindow(label, {
      url: target,
      title: "Supervision — Surveillance",
      width: 1280,
      height: 800,
      minWidth: 640,
      minHeight: 400,
      // Don't auto-focus the parent — we want the new window to come up front.
      focus: true,
    });

    win.once("tauri://error", (e) => {
      // eslint-disable-next-line no-console
      console.error("surveillance window failed:", e);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("openSurveillanceWindow:", err);
    throw err;
  }
}
