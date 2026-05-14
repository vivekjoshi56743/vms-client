import { useState } from "react";
import { Video } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VideoTile } from "@/components/video/VideoTile";
import { useCameras, useCameraHealth } from "@/hooks/useCameras";
import { useStream } from "@/hooks/useStream";

export function LivePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cameras = useCameras();
  const stream = useStream(selectedId);
  const health = useCameraHealth(selectedId ?? "");

  const selectedCamera = cameras.data?.find((c) => c.id === selectedId) ?? null;

  // Prefer WHEP for lowest latency; fall back to HLS.
  const videoUrl = stream.data?.webrtc ?? stream.data?.hls ?? null;

  const actions = (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-tertiary">
        Camera
      </span>
      <Select
        value={selectedId ?? ""}
        onValueChange={(v) => setSelectedId(v || null)}
        disabled={!cameras.data || cameras.data.length === 0}
      >
        <SelectTrigger className="h-8 w-[220px] font-mono text-[12px]">
          <SelectValue placeholder="Select a camera…" />
        </SelectTrigger>
        <SelectContent>
          {(cameras.data ?? []).map((cam) => (
            <SelectItem key={cam.id} value={cam.id} className="font-mono text-[12px]">
              {cam.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <AppShell title="Live" actions={actions}>
      <div className="flex h-full flex-col">
        {/* Stream error */}
        {stream.error && (
          <div className="mx-6 mt-4 rounded-card border border-status-critical/30 bg-status-critical-subtle px-4 py-2.5">
            <p className="font-mono text-[11.5px] text-status-critical">
              {stream.error instanceof Error ? stream.error.message : "Failed to get stream URLs"}
            </p>
          </div>
        )}

        {/* Main area */}
        <div className="flex flex-1 items-center justify-center p-6">
          {!selectedCamera ? (
            <NoCameraSelected
              hasCamera={(cameras.data?.length ?? 0) > 0}
              loading={cameras.isLoading}
            />
          ) : (
            <VideoTile
              camera={selectedCamera}
              url={videoUrl}
              health={health.data}
              className="max-h-full w-full"
              style={{ aspectRatio: "16 / 9" }}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function NoCameraSelected({
  hasCamera,
  loading,
}: {
  hasCamera: boolean;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface">
        <Video className="h-7 w-7 text-text-tertiary" />
      </div>
      <div>
        <p className="text-[16px] font-semibold text-text-primary">
          {loading ? "Loading cameras…" : hasCamera ? "Select a camera" : "No cameras"}
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          {loading
            ? "Fetching camera list from server"
            : hasCamera
              ? "Pick a camera from the dropdown above to start streaming"
              : "Add cameras on the Cameras page first"}
        </p>
      </div>
    </div>
  );
}
