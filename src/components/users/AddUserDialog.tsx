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
import { useCreateUser } from "@/hooks/useUsers";
import type { Role } from "@/api/users";

const schema = z.object({
  username: z.string().min(1, "Required").max(64),
  password: z.string().min(8, "Must be at least 8 characters"),
  role:     z.enum(["owner", "admin", "viewer"]),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddUserDialog({ open, onOpenChange }: Props) {
  const createUser = useCreateUser();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "", role: "viewer" satisfies Role },
  });

  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  async function onSubmit(values: FormValues) {
    await createUser.mutateAsync(values, {
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
            Add user
          </div>
          <DialogTitle>Create a new user</DialogTitle>
          <DialogDescription>
            Owners and admins can manage cameras and other users. Viewers
            can only watch live streams and recordings.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="add-user-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4 px-6 py-2"
            noValidate
          >
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="jsmith" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
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
                  <Select value={field.value} onValueChange={field.onChange}>
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
            disabled={createUser.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-user-form"
            variant="accent"
            disabled={createUser.isPending}
          >
            {createUser.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            ) : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
