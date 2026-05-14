import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

// Variants mirror .btn-primary / .btn-accent / .btn-secondary / .btn-ghost / .btn-danger
// from supervision-visual-system.html. Sizes match heights 36 / 28 / 44 px.
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-[7px] whitespace-nowrap",
    "font-sans font-semibold tracking-[-0.005em]",
    "rounded border border-transparent",
    "transition-all duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:opacity-40 disabled:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-ink text-text-inverse border-ink",
          "hover:bg-text-primary hover:-translate-y-px hover:shadow-md",
          "active:translate-y-0",
        ].join(" "),
        accent: [
          "bg-accent text-accent-on-accent border-accent",
          "hover:bg-accent-bright hover:border-accent-bright",
          "hover:ring-4 hover:ring-accent-glow",
        ].join(" "),
        secondary: [
          "bg-canvas-raised text-text-primary border-border",
          "hover:bg-surface hover:border-border-strong",
          "active:bg-surface-active",
        ].join(" "),
        ghost: [
          "bg-transparent text-text-primary",
          "hover:bg-surface active:bg-surface-active",
        ].join(" "),
        danger: [
          "bg-status-critical text-white border-status-critical",
          "hover:brightness-110 hover:ring-4 hover:ring-status-critical-glow",
          "active:brightness-90",
        ].join(" "),
      },
      size: {
        default: "h-9 px-4 text-sm",
        sm: "h-7 px-3 text-[13px]",
        lg: "h-11 px-5 text-[15px]",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-7 w-7 p-0",
        "icon-lg": "h-11 w-11 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
