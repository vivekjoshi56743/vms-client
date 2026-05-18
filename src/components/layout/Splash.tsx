import { Camera } from "lucide-react";

// Cold-start splash shown while AuthInitializer hydrates the session from
// the OS keychain. Intentionally token-driven so it picks up whichever theme
// is active before React mounts the app.

const ORBIT_OUTER_RADIUS = 140;
const ORBIT_INNER_RADIUS = 90;
const ORBIT_CAMERAS_OUTER = 6;
const ORBIT_CAMERAS_INNER = 3;

export function Splash() {
  return (
    <div
      className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-canvas-deep"
      style={{
        backgroundImage:
          "radial-gradient(circle, var(--border-subtle) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Orbital rings + brand */}
      <div className="relative flex h-[360px] w-[360px] items-center justify-center">
        {/* Outer ring */}
        <div
          className="absolute rounded-full border border-border-subtle"
          style={{
            width: ORBIT_OUTER_RADIUS * 2,
            height: ORBIT_OUTER_RADIUS * 2,
            animation: "splash-orbit 24s linear infinite",
          }}
        >
          {Array.from({ length: ORBIT_CAMERAS_OUTER }).map((_, i) => {
            const angle = (i / ORBIT_CAMERAS_OUTER) * 2 * Math.PI;
            const x = ORBIT_OUTER_RADIUS + Math.cos(angle) * ORBIT_OUTER_RADIUS;
            const y = ORBIT_OUTER_RADIUS + Math.sin(angle) * ORBIT_OUTER_RADIUS;
            return (
              <span
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas-raised p-1.5 text-accent"
                style={{
                  left: x,
                  top: y,
                  boxShadow: "0 0 12px var(--accent-glow)",
                  animation: `splash-dot-pulse 2.4s ease-in-out ${i * 0.15}s infinite`,
                }}
              >
                <Camera className="h-3 w-3" />
              </span>
            );
          })}
        </div>

        {/* Inner ring */}
        <div
          className="absolute rounded-full border border-border"
          style={{
            width: ORBIT_INNER_RADIUS * 2,
            height: ORBIT_INNER_RADIUS * 2,
            animation: "splash-orbit-reverse 16s linear infinite",
          }}
        >
          {Array.from({ length: ORBIT_CAMERAS_INNER }).map((_, i) => {
            const angle = (i / ORBIT_CAMERAS_INNER) * 2 * Math.PI;
            const x = ORBIT_INNER_RADIUS + Math.cos(angle) * ORBIT_INNER_RADIUS;
            const y = ORBIT_INNER_RADIUS + Math.sin(angle) * ORBIT_INNER_RADIUS;
            return (
              <span
                key={i}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                style={{
                  left: x,
                  top: y,
                  boxShadow: "0 0 8px var(--accent-glow)",
                }}
              />
            );
          })}
        </div>

        {/* Brand wordmark — floating */}
        <div
          className="relative z-10 flex items-center gap-2.5"
          style={{ animation: "splash-float 3.2s ease-in-out infinite" }}
        >
          <span className="text-[44px] font-extrabold leading-none tracking-[-0.045em]">
            <span className="text-text-primary">Super</span>
            <span className="text-accent">vision</span>
          </span>
          <span
            className="mt-1 h-[10px] w-[10px] rounded-full bg-accent"
            style={{
              boxShadow: "0 0 10px var(--accent-glow)",
              animation: "live-breathe 2.4s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      {/* Progress + label */}
      <div className="mt-12 w-[280px]">
        <div className="relative h-[2px] w-full overflow-hidden bg-border-subtle">
          <div
            className="absolute inset-y-0 left-0 w-full bg-accent"
            style={{
              animation: "splash-progress 1.5s ease-in-out infinite",
              boxShadow: "0 0 8px var(--accent-glow)",
            }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
            Connecting
          </span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-disabled">
            Initializing
          </span>
        </div>
      </div>

      {/* Footer */}
      <p className="absolute bottom-6 font-mono text-[10px] uppercase tracking-[0.22em] text-text-disabled">
        Establishing live feeds
      </p>
    </div>
  );
}
