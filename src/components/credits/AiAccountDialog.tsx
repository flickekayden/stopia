import { Link } from "@tanstack/react-router";
import { Gift, LogIn, UserPlus } from "lucide-react";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Shown when someone who is not signed in tries to use an AI feature. Both sign-in buttons bring the
 * player back to `returnTo` (for example the room they were in) afterwards.
 */
export function AiAccountDialog({ open, onOpenChange, returnTo }: { open: boolean; onOpenChange: (open: boolean) => void; returnTo: string }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100%_-_2rem)] rounded-2xl border-border bg-card">
        <AlertDialogHeader>
          <span className="party-icon mx-auto size-14" aria-hidden="true"><Gift className="size-7" /></span>
          <AlertDialogTitle className="text-center font-display text-2xl">Desbloqueie sua IA gratuita!</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Crie sua conta gratuitamente para receber 20 créditos de IA e utilizar os recursos inteligentes do Stopia.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button asChild className="h-12 w-full font-bold">
            <Link to="/entrar" search={{ modo: "criar", voltar: returnTo }} onClick={() => onOpenChange(false)}><UserPlus /> Criar conta grátis</Link>
          </Button>
          <Button asChild variant="secondary" className="h-12 w-full">
            <Link to="/entrar" search={{ modo: "entrar", voltar: returnTo }} onClick={() => onOpenChange(false)}><LogIn /> Já tenho conta</Link>
          </Button>
          <AlertDialogCancel className="mt-0 h-12 w-full">Agora não</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
