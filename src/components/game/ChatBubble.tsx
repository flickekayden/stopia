import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Plain room messages need no Markdown, syntax highlighting or diagram engines.
export function ChatBubble({ mine, className, ...props }: HTMLAttributes<HTMLDivElement> & { mine: boolean }) {
  return <div className={cn("group flex w-full max-w-[95%] flex-col gap-2", mine ? "is-user ml-auto justify-end" : "is-assistant", className)} {...props} />;
}
export function ChatBubbleContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm", "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground group-[.is-assistant]:text-foreground", className)} {...props} />;
}