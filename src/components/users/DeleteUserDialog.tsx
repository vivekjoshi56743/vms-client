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
import { useDeleteUser } from "@/hooks/useUsers";
import type { User } from "@/api/users";

interface Props {
  user: User | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteUserDialog({ user, onOpenChange }: Props) {
  const deleteUser = useDeleteUser();

  async function onConfirm() {
    if (!user) return;
    await deleteUser.mutateAsync(user.id, {
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-status-critical">
            Confirm delete
          </div>
          <DialogTitle>Delete &ldquo;{user?.username}&rdquo;?</DialogTitle>
          <DialogDescription>
            This permanently removes the user account and ends any active
            sessions they have. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="mx-6 my-1 rounded-card border border-border bg-canvas-raised px-4 py-3">
            <p className="font-mono text-[11.5px] text-text-secondary">
              <span className="text-text-tertiary">role · </span>
              <span className="uppercase">{user.role}</span>
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={deleteUser.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={deleteUser.isPending}
          >
            {deleteUser.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</>
            ) : "Delete user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
