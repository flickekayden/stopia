import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const phrases = [
  "Consultando o dicionário dos desesperados...",
  "Checando se essa palavra realmente existe...",
  "Desmascarando quem inventou resposta...",
  "Calculando o vexame com rigor científico...",
  "Quase pronto! Somando a pontuação da rodada...",
];

export function EvaluationLoading() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % phrases.length), 2_500);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div role="status" aria-label="Avaliando respostas" className="w-full space-y-3 py-2 text-center">
      <div className="flex items-center justify-center gap-2 font-bold"><Loader2 className="size-5 animate-spin text-primary" /> Avaliando respostas...</div>
      <p key={index} className="evaluation-phrase min-h-12 text-sm text-muted-foreground">{phrases[index]}</p>
      <div className="h-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true"><div className="evaluation-progress h-full w-1/3 rounded-full bg-primary" /></div>
    </div>
  );
}