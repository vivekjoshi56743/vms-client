import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePatchUser } from "@/hooks/useUsers";
import type { Role, User } from "@/api/users";

const schema = z.object({
  password: z.string().refine(
    (v) => v === "" || v.length >= 8,
    "Must be at least 8 characters (or leave blank)"
  ),
  role: z.enum(["owner", "admin", "viewer"]),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  user: User | null;
  onOpenChange: (open: boolean) => void;
  /** If true, role select is disabled — used for self-edits (can't change own role). */
  lockRole?: boolean;
}

export function EditUserDialog({ user, onOpenChange, lockRole }: Props) {
  const patchUser = usePatchUser();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", role: "viewer" satisfies Role },
  });

  // Reset to current user's role each time the dialog opens for a new user.
  useEffect(() => {
    if (user) {
      form.reset({ password: "", role: user.role });
    }
  }, [user, form]);

  async function onSubmit(values: FormValues) {
    if (!user) return;
    const payload: { password?: string; role?: Role } = {};
    if (values.password) payload.password = values.password;
    if (!lockRole && values.role !== user.role) payload.role = values.role;
    // No-op patch — close without hitting the server.
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }
    await patchUser.mutateAsync(
      { id: user.id, input: payload },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
            Edit user
          </div>
          <DialogTitle>{user?.username}</DialogTitle>
          <DialogDescription>
            Leave password blank to keep the current one. Role changes take
            effect on the user&apos;s next request.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="edit-user-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4 px-6 py-2"
            noValidate
          >
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      autoComplete="new-password"
                      placeholder="Leave blank to keep current"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={lockRole}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                  {lockRole && (
                    <p className="mt-1 text-[11px] text-text-tertiary">
                      You can&apos;t change your own role.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={patchUser.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-user-form"
            variant="accent"
            disabled={patchUser.isPending}
          >
            {patchUser.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            ) : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
