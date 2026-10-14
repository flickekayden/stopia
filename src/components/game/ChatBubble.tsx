import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Plain room messages need no Markdown, syntax highlighting or diagram engines.
export function ChatBubble({ mine, className, ...props }: HTMLAttributes<HTMLDivElement> & { mine: boolean }) {
  return <div className={cn("group flex w-full max-w-[95%] flex-col gap-2", mine ? "is-user ml-auto justify-end" : "is-assistant", className)} {...props} />;
}
export function ChatBubbleContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden rounded-lg px-4 py-3 text-sm leading-relaxed", "group-[.is-user]:ml-auto group-[.is-user]:bg-primary/10 group-[.is-user]:text-foreground group-[.is-assistant]:bg-card group-[.is-assistant]:text-foreground", className)} {...props} />;
}