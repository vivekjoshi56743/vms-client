import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { useAddCamera } from "@/hooks/useCameras";

const schema = z.object({
  name:      z.string().min(1, "Required"),
  rtsp_url:  z.string().min(1, "Required").refine(
    (v) => v.startsWith("rtsp://") || v.startsWith("rtsps://"),
    "Must start with rtsp:// or rtsps://"
  ),
  username:  z.string().optional(),
  password:  z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCameraDialog({ open, onOpenChange }: Props) {
  const addCamera = useAddCamera();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", rtsp_url: "", username: "", password: "" },
  });

  // Reset form when dialog closes.
  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  async function onSubmit(values: FormValues) {
    await addCamera.mutateAsync(
      {
        name: values.name,
        rtsp_url: values.rtsp_url,
        username: values.username || undefined,
        password: values.password || undefined,
        driver_type: "generic_rtsp",
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
            Add camera
          </div>
          <DialogTitle>Connect a new camera</DialogTitle>
          <DialogDescription>
            Enter the RTSP stream URL and optional credentials. The camera will
            be probed immediately after saving.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="add-camera-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4 px-6 py-2"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Front door" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rtsp_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RTSP URL</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="rtsp://192.168.1.42:554/stream1"
                      className="font-mono text-[13px]"
                      spellCheck={false}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" placeholder="admin" />
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
            </div>

            <p className="text-[11px] leading-relaxed text-text-tertiary">
              Credentials are stored on the server and used only for RTSP
              authentication. They are not stored locally.
            </p>
          </form>
        </Form>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={addCamera.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-camera-form"
            variant="accent"
            disabled={addCamera.isPending}
          >
            {addCamera.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>
            ) : "Add camera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
