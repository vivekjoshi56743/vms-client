import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Radar } from "lucide-react";

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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DiscoveredCameraRow } from "./DiscoveredCameraRow";
import { useCameras } from "@/hooks/useCameras";
import { useDiscoverCameras, useDiscardCamera } from "@/hooks/useDiscovery";
import {
  DISCOVERY_METHODS,
  type DiscoveryMethodId,
  type NVRDiscoverResult,
} from "@/api/discovery";

const schema = z.object({
  url: z.string().min(1, "Required"),
  username: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiscoveryDialog({ open, onOpenChange }: Props) {
  const [method, setMethod] = useState<DiscoveryMethodId>("onvif");
  const [result, setResult] = useState<NVRDiscoverResult | null>(null);
  // The connection password is reused as the RTSP credential when adding.
  const [connectionPassword, setConnectionPassword] = useState("");

  const cameras = useCameras();
  const discover = useDiscoverCameras();
  const discard = useDiscardCamera();
  const queryClient = useQueryClient();

  // Track temp preview cameras created while the dialog is open so we can
  // sweep them up if the user closes without keeping them.
  const tempIds = useRef<Set<string>>(new Set());

  const activeMethod = DISCOVERY_METHODS.find((m) => m.id === method)!;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { url: "", username: "", password: "" },
  });

  function cleanupTemps() {
    const ids = Array.from(tempIds.current);
    tempIds.current.clear();
    if (ids.length === 0) return;
    // Fire-and-forget deletes, then refresh the camera list.
    Promise.allSettled(ids.map((id) => discard.mutateAsync(id))).finally(() => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
    });
  }

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (!open) {
      cleanupTemps();
      setResult(null);
      setConnectionPassword("");
      form.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: FormValues) {
    const res = await discover.mutateAsync({
      methodId: method,
      request: values,
    });
    setConnectionPassword(values.password);
    setResult(res);
  }

  function backToConnect() {
    cleanupTemps();
    setResult(null);
  }

  // rtsp_url set for de-duping discovered cameras against existing ones.
  const existingUrls = new Set((cameras.data ?? []).map((c) => c.rtsp_url));

  const showResults = result !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <div className="mb-2 inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
            <Radar className="h-3.5 w-3.5" />
            NVR discovery
          </div>
          <DialogTitle>
            {showResults ? "Discovered cameras" : "Discover cameras on an NVR"}
          </DialogTitle>
          <DialogDescription>
            {showResults
              ? `${result!.cameras.length} camera${
                  result!.cameras.length !== 1 ? "s" : ""
                } found on ${result!.nvr_host || "the NVR"}. Preview a feed, then add it.`
              : "Connect to an NVR or DVR to enumerate its cameras and pull their RTSP streams."}
          </DialogDescription>
        </DialogHeader>

        {!showResults && (
          <div className="flex flex-col gap-4 px-6 py-2">
            {/* Method picker — driven by the DISCOVERY_METHODS registry. */}
            <Tabs
              value={method}
              onValueChange={(v) => setMethod(v as DiscoveryMethodId)}
            >
              <TabsList>
                {DISCOVERY_METHODS.map((m) => (
                  <TabsTrigger key={m.id} value={m.id}>
                    {m.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="-mt-1 text-[11px] leading-relaxed text-text-tertiary">
              {activeMethod.description}
            </p>

            <Form {...form}>
              <form
                id="discovery-form"
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
                noValidate
              >
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NVR address</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={activeMethod.urlPlaceholder}
                          className="font-mono text-[13px]"
                          spellCheck={false}
                          autoFocus
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
                  Credentials are used to query the NVR and are reused as the
                  RTSP credential for any camera you add.
                </p>
              </form>
            </Form>
          </div>
        )}

        {showResults && (
          <div className="flex max-h-[420px] flex-col gap-2.5 overflow-y-auto px-6 py-2">
            {result!.cameras.length === 0 ? (
              <div className="rounded-card border border-dashed border-border py-12 text-center">
                <p className="text-[14px] font-semibold text-text-primary">
                  No cameras found
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  The NVR responded but reported no camera channels.
                </p>
              </div>
            ) : (
              result!.cameras.map((cam, i) => (
                <DiscoveredCameraRow
                  key={`${cam.rtsp_url}-${cam.profile_token}-${i}`}
                  camera={cam}
                  connectionPassword={connectionPassword}
                  alreadyAdded={existingUrls.has(cam.rtsp_url)}
                  onTempCreated={(id) => tempIds.current.add(id)}
                  onTempCleared={(id) => tempIds.current.delete(id)}
                />
              ))
            )}
          </div>
        )}

        <DialogFooter>
          {showResults ? (
            <>
              <Button variant="ghost" onClick={backToConnect}>
                <ArrowLeft className="h-4 w-4" />
                Discover again
              </Button>
              <Button variant="accent" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={discover.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="discovery-form"
                variant="accent"
                disabled={discover.isPending}
              >
                {discover.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Discovering…
                  </>
                ) : (
                  <>
                    <Radar className="h-4 w-4" /> Discover
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
