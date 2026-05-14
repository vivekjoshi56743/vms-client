import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { LoginForm } from "@/components/auth/LoginForm";
import { useIsAuthenticated } from "@/hooks/useAuth";

// Full-bleed split: brand panel on the left, sign-in card on the right.
// Mirrors the "two-pane operator entry" treatment described in the design
// system (canvas vs. canvas-deep, brand mark with brand-pulse).

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthed = useIsAuthenticated();

  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? "/dashboard";

  useEffect(() => {
    if (isAuthed) navigate(redirectTo, { replace: true });
  }, [isAuthed, navigate, redirectTo]);

  return (
    <div className="grid min-h-screen grid-cols-[5fr_4fr] bg-canvas text-text-primary">
      {/* Brand panel */}
      <aside className="hidden md:flex relative flex-col justify-between overflow-hidden bg-canvas-deep border-r border-border-subtle px-14 py-12">
        <div className="flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
          <span className="relative inline-block h-[18px] w-[18px]">
            <span className="absolute inset-[3px] rounded-sm bg-accent" />
            <span className="absolute inset-0 rounded-sm border border-accent animate-brand-pulse" />
          </span>
          <span className="font-bold text-text-primary">SUPERVISION</span>
        </div>

        <div>
          <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            <span className="block h-px w-4 bg-accent" />
            Operator sign-in
          </div>
          <h1 className="mb-4 text-[56px] font-bold leading-[1.05] tracking-tight">
            Supervision<span className="text-accent">.</span>
          </h1>
          <p className="max-w-[460px] text-[16px] leading-relaxed text-text-secondary">
            Connect to a Supervision server. The first connection pins the
            server's TLS fingerprint locally — subsequent sessions will warn
            you if the certificate ever changes.
          </p>
        </div>

        <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-tertiary">
          v0.1.0 · trust on first use
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <div className="mb-2 inline-flex items-center gap-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              <span className="block h-px w-4 bg-text-tertiary" />
              Sign in
            </div>
            <h2 className="text-[32px] font-bold leading-tight tracking-tight">
              Welcome back<span className="text-accent">.</span>
            </h2>
          </div>
          <LoginForm onSuccess={() => navigate(redirectTo, { replace: true })} />
        </div>
      </main>
    </div>
  );
}
