import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteCamera } from "@/hooks/useCameras";
import type { Camera } from "@/api/cameras";

interface Props {
  camera: Camera | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteCameraDialog({ camera, onOpenChange }: Props) {
  const deleteCamera = useDeleteCamera();

  async function onConfirm() {
    if (!camera) return;
    await deleteCamera.mutateAsync(camera.id, {
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <Dialog open={camera !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-status-critical">
            Confirm delete
          </div>
          <DialogTitle>Delete &ldquo;{camera?.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            This will permanently remove the camera and all its recorded
            segments from the server. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {camera && (
          <div className="mx-6 my-1 rounded-card border border-border bg-canvas-raised px-4 py-3">
            <p className="font-mono text-[11.5px] break-all text-text-secondary">
              {camera.rtsp_url}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={deleteCamera.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={deleteCamera.isPending}
          >
            {deleteCamera.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</>
            ) : "Delete camera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
