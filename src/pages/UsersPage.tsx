import { useState } from "react";
import { Plus, Pencil, Trash2, ShieldOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddUserDialog } from "@/components/users/AddUserDialog";
import { EditUserDialog } from "@/components/users/EditUserDialog";
import { DeleteUserDialog } from "@/components/users/DeleteUserDialog";
import { useUsers } from "@/hooks/useUsers";
import { useAuthStore } from "@/stores/auth";
import type { Role, User } from "@/api/users";

export function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const users = useUsers();

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const isPrivileged = me?.role === "owner" || me?.role === "admin";

  // Viewers don't get this page at all — surface a friendly message instead of
  // an HTTP 403 from the API. (Route still lives in App.tsx; we just guard
  // here so we can keep the link in the sidebar for everyone and render a
  // consistent fallback.)
  if (!isPrivileged) {
    return (
      <AppShell title="Users">
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 py-16 text-center">
          <ShieldOff className="h-10 w-10 text-text-tertiary" />
          <p className="text-[16px] font-semibold text-text-primary">
            Admins only
          </p>
          <p className="max-w-sm text-[13px] text-text-secondary">
            You need owner or admin permissions to view and manage users.
            Your current role is <span className="font-mono uppercase text-text-primary">{me?.role ?? "unknown"}</span>.
          </p>
        </div>
      </AppShell>
    );
  }

  const actions = (
    <Button variant="accent" size="sm" onClick={() => setAddOpen(true)}>
      <Plus className="h-4 w-4" />
      Add user
    </Button>
  );

  return (
    <AppShell title="Users" actions={actions}>
      <div className="px-10 py-10">
        <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          <span className="block h-px w-4 bg-accent" />
          User management
        </div>
        <div className="mb-8 flex items-end justify-between">
          <h1 className="text-[32px] font-bold leading-none tracking-tight">
            Users<span className="text-accent">.</span>
          </h1>
          {users.data && users.data.length > 0 && (
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">
              {users.data.length} user{users.data.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {users.isLoading && <UserListSkeleton />}

        {users.error && (
          <div className="rounded-card border border-status-critical/30 bg-status-critical-subtle px-5 py-4">
            <p className="font-mono text-[12px] text-status-critical">
              {users.error instanceof Error ? users.error.message : "Failed to load users"}
            </p>
          </div>
        )}

        {users.data && users.data.length > 0 && (
          <div className="overflow-hidden rounded-card border border-border-subtle bg-canvas-raised">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-subtle">
                  <Th>Username</Th>
                  <Th>Role</Th>
                  <Th>Created</Th>
                  <Th className="text-right pr-5">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isMe={u.id === me?.id}
                    onEdit={setEditTarget}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditUserDialog
        user={editTarget}
        lockRole={editTarget?.id === me?.id}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
      />
      <DeleteUserDialog
        user={deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      />
    </AppShell>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-5 py-3 text-left font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-tertiary ${className}`}>
      {children}
    </th>
  );
}

function UserRow({
  user,
  isMe,
  onEdit,
  onDelete,
}: {
  user: User;
  isMe: boolean;
  onEdit: (u: User) => void;
  onDelete: (u: User) => void;
}) {
  return (
    <tr className="border-b border-border-subtle last:border-b-0 transition-colors hover:bg-surface/30">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary">{user.username}</span>
          {isMe && (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
              · you
            </span>
          )}
        </div>
      </td>
      <td className="px-5 py-3.5">
        <RoleBadge role={user.role} />
      </td>
      <td className="px-5 py-3.5 font-mono text-[11.5px] text-text-secondary">
        {user.created_at
          ? formatDistanceToNow(new Date(user.created_at), { addSuffix: true })
          : "—"}
      </td>
      <td className="px-5 py-3.5 text-right">
        <div className="inline-flex gap-1">
          <button
            onClick={() => onEdit(user)}
            aria-label="Edit user"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(user)}
            disabled={isMe}
            aria-label={isMe ? "Can't delete yourself" : "Delete user"}
            title={isMe ? "Can't delete yourself" : undefined}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-status-critical-subtle hover:text-status-critical disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-tertiary"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function RoleBadge({ role }: { role: Role }) {
  // Owner = accent (highest privilege), admin = warning, viewer = neutral.
  const variant: "active" | "warning" | "offline" =
    role === "owner" ? "active" : role === "admin" ? "warning" : "offline";
  return (
    <Badge variant={variant} className="font-mono text-[10px] uppercase tracking-[0.08em]">
      {role}
    </Badge>
  );
}

function UserListSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border-subtle bg-canvas-raised">
      <div className="border-b border-border-subtle px-5 py-3">
        <span className="block h-2.5 w-24 animate-shimmer rounded bg-surface-active" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-6 border-b border-border-subtle px-5 py-4 last:border-b-0"
        >
          <span className="block h-3 w-32 animate-shimmer rounded bg-surface-active" />
          <span className="block h-5 w-16 animate-shimmer rounded-full bg-surface-active" />
          <span className="ml-auto block h-3 w-24 animate-shimmer rounded bg-surface-active" />
        </div>
      ))}
    </div>
  );
}
