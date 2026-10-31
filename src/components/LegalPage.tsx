import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export const SUPPORT_EMAIL = "carlosrpm2018@gmail.com";
export const LEGAL_UPDATED = "31/10/2026";

/** Shared frame for the terms, privacy and support pages. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="game-screen mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-4 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <header className="top-actions-clear space-y-2 pt-2">
        <Button asChild variant="ghost" className="-ml-2 h-11 px-2"><Link to="/"><ArrowLeft /> Início</Link></Button>
        <h1 className="font-display text-4xl leading-none text-primary">{title}</h1>
        <p className="text-xs text-muted-foreground">Atualizado em {LEGAL_UPDATED}</p>
      </header>
      <article className="legal-prose">{children}</article>
      <nav className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-sm" aria-label="Informações">
        <Link to="/termos" className="underline">Termos</Link>
        <Link to="/privacidade" className="underline">Privacidade</Link>
        <Link to="/suporte" className="underline">Suporte</Link>
      </nav>
    </main>
  );
}
