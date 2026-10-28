import { Dices, Eye, Feather, Gavel, Mic, Timer, type LucideProps } from "lucide-react";

import type { PartyGameMeta } from "@/lib/party-games";

const ICONS = { gavel: Gavel, feather: Feather, eye: Eye, mic: Mic, dices: Dices, stop: Timer } as const;

export function PartyIcon({ name, ...props }: { name: PartyGameMeta["icon"] | "stop" } & LucideProps) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" {...props} />;
}
