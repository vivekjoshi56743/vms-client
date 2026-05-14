import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

// .badge-{online,warning,critical,offline,active} from supervision-visual-system.html.
// JetBrains Mono, 12px, 2/8 padding, status-subtle backgrounds + status-tone text.
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 whitespace-nowrap",
    "rounded px-2 py-0.5",
    "font-mono text-xs font-medium",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  ].join(" "),
  {
    variants: {
      variant: {
        online: "bg-status-online-subtle text-status-online",
        warning: "bg-status-warning-subtle text-status-warning",
        critical: "bg-status-critical-subtle text-status-critical",
        offline: "bg-status-offline-subtle text-status-offline",
        active: "bg-accent-subtle text-accent-text",
      },
    },
    defaultVariants: {
      variant: "offline",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
