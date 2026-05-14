import { Toaster as Sonner } from "sonner";

import { useUIStore } from "@/stores/ui";

// .toast from docs/supervision-visual-system.html — canvas-overlay surface,
// 3px colored left border per severity, shadow-md.
type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = (props: ToasterProps) => {
  const theme = useUIStore((s) => s.theme);
  const sonnerTheme: ToasterProps["theme"] = theme === "light" ? "light" : "dark";

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-canvas-overlay group-[.toaster]:text-text-primary group-[.toaster]:border-border group-[.toaster]:shadow-md",
          description: "group-[.toast]:text-text-secondary",
          actionButton:
            "group-[.toast]:bg-ink group-[.toast]:text-text-inverse",
          cancelButton:
            "group-[.toast]:bg-surface group-[.toast]:text-text-secondary",
          error: "group-[.toaster]:border-l-status-critical group-[.toaster]:border-l-[3px]",
          success: "group-[.toaster]:border-l-status-online group-[.toaster]:border-l-[3px]",
          warning: "group-[.toaster]:border-l-status-warning group-[.toaster]:border-l-[3px]",
          info: "group-[.toaster]:border-l-accent group-[.toaster]:border-l-[3px]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
