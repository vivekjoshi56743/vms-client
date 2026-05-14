import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TOFUDialog } from "@/components/auth/TOFUDialog";
import { APIError } from "@/api/client";
import { useLogin } from "@/hooks/useAuth";
import {
  isTauri,
  peekCert,
  trustCert,
  type CertInfo,
} from "@/lib/fingerprint";
import { useAuthStore } from "@/stores/auth";

const DEFAULT_SERVER =
  import.meta.env.VITE_API_BASE_URL ?? "https://localhost:8443";

const loginSchema = z.object({
  serverUrl: z
    .string()
    .min(1, "Required")
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === "https:" || u.protocol === "http:";
      } catch {
        return false;
      }
    }, "Must be a valid http(s) URL"),
  username: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const rememberedServer = useAuthStore((s) => s.serverUrl);
  const setServer = useAuthStore((s) => s.setServer);
  const loginMutation = useLogin();

  const [showPassword, setShowPassword] = useState(false);
  const [pendingCert, setPendingCert] = useState<CertInfo | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [trusting, setTrusting] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      serverUrl: rememberedServer ?? DEFAULT_SERVER,
      username: "",
      password: "",
    },
  });

  async function doLogin(username: string, password: string) {
    try {
      await loginMutation.mutateAsync({ username, password });
      toast.success("Signed in");
      onSuccess?.();
    } catch (err) {
      const message =
        err instanceof APIError
          ? err.status === 401
            ? "Incorrect username or password"
            : err.message
          : err instanceof Error
            ? err.message
            : "Sign-in failed";
      toast.error(message);
    }
  }

  async function onSubmit(values: LoginFormValues) {
    // Persist the chosen server first so the client middleware can rewrite
    // requests to it.
    setServer(values.serverUrl);

    // Skip TOFU when:
    //   a) running in a plain browser (no Rust layer to call)
    //   b) the server URL is http:// — no TLS means no cert to pin
    const isHttps = values.serverUrl.startsWith("https://");
    if (!isTauri() || !isHttps) {
      await doLogin(values.username, values.password);
      return;
    }

    let cert: CertInfo;
    try {
      cert = await peekCert(values.serverUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Couldn't reach ${values.serverUrl}: ${msg}`);
      return;
    }

    const fresh = !cert.already_trusted;
    const changed = cert.previously_trusted_fingerprint !== null;

    if (fresh || changed) {
      setPendingCert(cert);
      setPendingCredentials({
        username: values.username,
        password: values.password,
      });
      return;
    }

    await doLogin(values.username, values.password);
  }

  async function onAcceptCert() {
    if (!pendingCert || !pendingCredentials) return;
    setTrusting(true);
    try {
      await trustCert(pendingCert.host_port, pendingCert.fingerprint_sha256);
      const creds = pendingCredentials;
      setPendingCert(null);
      setPendingCredentials(null);
      await doLogin(creds.username, creds.password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Trust failed: ${msg}`);
    } finally {
      setTrusting(false);
    }
  }

  function onCancelCert() {
    setPendingCert(null);
    setPendingCredentials(null);
  }

  const submitting = loginMutation.isPending || trusting;

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-5"
          noValidate
        >
          <FormField
            control={form.control}
            name="serverUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                    Server
                  </span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="url"
                    spellCheck={false}
                    className="font-mono text-[13px]"
                    placeholder="https://localhost:8443"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                    Username
                  </span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="admin"
                  />
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
                <FormLabel>
                  <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                    Password
                  </span>
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-tertiary hover:text-text-primary hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={submitting}
            className="mt-1 w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </Form>

      <TOFUDialog
        open={pendingCert !== null}
        cert={pendingCert}
        isMismatch={pendingCert?.previously_trusted_fingerprint != null}
        onTrust={onAcceptCert}
        onCancel={onCancelCert}
        pending={trusting}
      />
    </>
  );
}
