import { useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, Loader2, Plus, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VideoPlayer, type PlayerState } from "@/components/video/VideoPlayer";
import { ConnectingSplash } from "@/components/video/ConnectingSplash";
import { useAddCamera } from "@/hooks/useCameras";
import {
  usePreviewCamera,
  useDiscardCamera,
  type PreviewSession,
} from "@/hooks/useDiscovery";
import type { DiscoveredCamera } from "@/api/discovery";
import type { CreateCameraInput } from "@/api/cameras";

type RowStatus = "idle" | "previewing" | "added";

interface Props {
  camera: DiscoveredCamera;
  /** Password entered for the NVR connection — reused as RTSP credential. */
  connectionPassword: string;
  /** True if a camera with this rtsp_url already exists on the server. */
  alreadyAdded: boolean;
  /** Report a temp preview camera so the dialog can sweep it up on close. */
  onTempCreated: (id: string) => void;
  onTempCleared: (id: string) => void;
}

function toInput(c: DiscoveredCamera, password: string): CreateCameraInput {
  return {
    name: c.name || "Camera",
    rtsp_url: c.rtsp_url,
    username: c.username || undefined,
    password: password || undefined,
    driver_type: "generic_rtsp",
  };
}

export function DiscoveredCameraRow({
  camera,
  connectionPassword,
  alreadyAdded,
  onTempCreated,
  onTempCleared,
}: Props) {
  const preview = usePreviewCamera();
  const discard = useDiscardCamera();
  const add = useAddCamera();

  const [status, setStatus] = useState<RowStatus>(
    alreadyAdded ? "added" : "idle"
  );
  const [session, setSession] = useState<PreviewSession | null>(null);
  // Player state for the preview tile — feeds the ConnectingSplash overlay
  // the same way LivePage feeds its grid splash. Reset whenever the previewed
  // camera changes so the splash re-runs its lifecycle.
  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  useEffect(() => {
    setPlayerState("idle");
  }, [session?.cameraId]);

  // Scroll the row's player area into view when preview starts — the
  // dialog's scrollable region is short (max-h-[420px]) and a previewing
  // row at the bottom of the list otherwise leaves the player partially
  // clipped, hiding the splash's centered content.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status === "previewing" && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [status]);

  const busy = preview.isPending || discard.isPending || add.isPending;
  const input = () => toInput(camera, connectionPassword);

  async function startPreview() {
    const s = await preview.mutateAsync(input());
    onTempCreated(s.cameraId);
    setSession(s);
    setStatus("previewing");
  }

  async function stopPreview() {
    // Tear down the UI immediately — the user pressed Stop and expects the
    // player to vanish *now*, not after a network round-trip. If the discard
    // call fails (camera already gone, transient error), the dialog's
    // close-time sweep will catch the temp camera anyway.
    const id = session?.cameraId ?? null;
    setSession(null);
    setStatus("idle");
    if (id) {
      try {
        await discard.mutateAsync(id);
      } catch {
        // Best-effort cleanup — dialog close sweeps stragglers.
      }
      onTempCleared(id);
    }
  }

  // Add directly from the discovered list (no preview).
  async function addDirect() {
    await add.mutateAsync(input());
    setStatus("added");
  }

  // Keep a previewed camera. Rename isn't supported by the API, so swap the
  // temp camera for one with the clean name.
  async function keepPreview() {
    if (session) {
      await discard.mutateAsync(session.cameraId);
      onTempCleared(session.cameraId);
    }
    await add.mutateAsync(input());
    setSession(null);
    setStatus("added");
  }

  const streamUrl = session ? session.webrtc ?? session.hls : null;

  return (
    <div ref={rowRef} className="rounded-card border border-border bg-canvas-raised">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-surface text-text-tertiary">
          <Video className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-text-primary">
              {camera.name || "Unnamed camera"}
            </span>
            {camera.profile_token && (
              <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                {camera.profile_token}
              </span>
            )}
          </div>
          <p className="truncate font-mono text-[11.5px] text-text-tertiary">
            {camera.rtsp_url}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status === "added" && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-status-online">
              <Check className="h-3.5 w-3.5" />
              {alreadyAdded ? "Already added" : "Added"}
            </span>
          )}

          {status === "idle" && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={startPreview}
                disabled={busy}
              >
                {preview.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                Preview
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={addDirect}
                disabled={busy}
              >
                {add.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add
              </Button>
            </>
          )}

          {status === "previewing" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={stopPreview}
                disabled={busy}
              >
                <EyeOff className="h-3.5 w-3.5" />
                Stop
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={keepPreview}
                disabled={busy}
              >
                {add.isPending || discard.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Keep
              </Button>
            </>
          )}
        </div>
      </div>

      {status === "previewing" && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {/* Fixed-height preview tile — `aspect-video` at the row's width
              produces a ~394 px tall area that overflows the dialog's
              max-h-[420px] scroll region. A modest 260 px gives a usable
              preview AND keeps the splash's centered content inside the
              visible scroll viewport. */}
          <div className="relative h-[260px] w-full">
            <VideoPlayer
              url={streamUrl}
              hlsFallback={session?.hls ?? null}
              muted
              onStateChange={setPlayerState}
              className="h-full w-full rounded"
            />
            {/* Same splash as Live view — covers MediaMTX warmup races
                (path-not-configured / no-one-publishing) under a clean
                "connecting" overlay instead of a transient error. */}
            {session && (
              <ConnectingSplash
                slotCameraIds={[session.cameraId]}
                tileStates={{ [session.cameraId]: playerState }}
                healthMap={{}}
                eyebrow="Establishing preview"
                caption="Connecting stream"
                fallbackMs={10_000}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
