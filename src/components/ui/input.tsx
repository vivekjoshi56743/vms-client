import * as React from "react";

import { cn } from "@/lib/cn";

// .input from docs/supervision-visual-system.html — 36px height, surface-input bg,
// 4px radius, border-border default, accent border + glow on focus.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded border border-border bg-surface-input px-3 py-1",
          "text-sm text-text-primary tracking-[-0.005em]",
          "transition-colors [transition-duration:120ms]",
          "placeholder:text-text-tertiary",
          "hover:border-border-strong",
          "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent-glow",
          "disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-50",
          "aria-invalid:border-status-critical aria-invalid:focus-visible:ring-status-critical-glow",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text-primary",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
