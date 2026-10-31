/**
 * "Boletim da Vergonha": draws the final podium (and the AI awards, when there are any) into a 1080×1350
 * image for WhatsApp. Browser-only; call it from a click handler. Colours come from the active theme.
 */
export type ShareCardInput = {
  gameName: string;
  code: string;
  ranked: { nickname: string; score: number; place: number }[];
  highlights: { name: string; title: string; text: string }[];
  summary?: string | undefined;
  king?: string | null | undefined;
};

function themeColor(variable: string, fallback: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${variable})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || fallback;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/\s*\S*$/, "")}…`;
  return lines;
}

export async function drawShareCard(input: ShareCardInput): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu desenhar a imagem.");
  const bg = themeColor("--background", "#101114");
  const card = themeColor("--card", "#1c1e23");
  const primary = themeColor("--primary", "#ffd429");
  const onPrimary = themeColor("--primary-foreground", "#101114");
  const text = themeColor("--foreground", "#f5f5f2");
  const muted = themeColor("--muted-foreground", "#969aa3");
  const display = getComputedStyle(document.body).getPropertyValue("--font-display").trim() || "sans-serif";
  const sans = getComputedStyle(document.body).fontFamily || "sans-serif";
  try { await document.fonts?.ready; } catch { /* system fonts are fine */ }

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, W, 16);

  ctx.textAlign = "center";
  ctx.fillStyle = primary;
  ctx.font = `700 34px ${sans}`;
  ctx.fillText("BOLETIM DA VERGONHA", W / 2, 96);
  ctx.fillStyle = text;
  ctx.font = `64px ${display}`;
  ctx.fillText(input.gameName, W / 2, 176);
  ctx.fillStyle = muted;
  ctx.font = `500 30px ${sans}`;
  ctx.fillText(`Sala ${input.code} · Stopia`, W / 2, 224);

  // Podium: 2nd, 1st, 3rd.
  const top = input.ranked.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const heights = [220, 300, 160];
  const colW = 280;
  const baseY = 680;
  order.forEach((row, i) => {
    if (!row) return;
    const x = W / 2 + (i - 1) * (colW + 30) - colW / 2;
    const h = heights[i]!;
    ctx.fillStyle = i === 1 ? primary : card;
    ctx.beginPath();
    ctx.roundRect(x, baseY - h, colW, h, 24);
    ctx.fill();
    ctx.fillStyle = i === 1 ? onPrimary : text;
    ctx.font = `800 76px ${sans}`;
    ctx.fillText(`${row.place}º`, x + colW / 2, baseY - h + 100);
    ctx.font = `700 34px ${sans}`;
    ctx.fillText(`${row.score} pts`, x + colW / 2, baseY - h + 150);
    ctx.fillStyle = text;
    ctx.font = `700 32px ${sans}`;
    const lines = wrap(ctx, row.nickname, colW + 20, 2);
    lines.forEach((line, j) => ctx.fillText(line, x + colW / 2, baseY - h - 24 - (lines.length - 1 - j) * 38));
    if (row.nickname === input.king) {
      ctx.font = `56px ${sans}`;
      ctx.fillText("👑", x + colW / 2, baseY - h - 34 - lines.length * 38);
    }
  });

  let y = baseY + 80;
  ctx.textAlign = "left";
  const highlights = input.highlights.slice(0, 3);
  for (const h of highlights) {
    ctx.fillStyle = card;
    ctx.beginPath();
    ctx.roundRect(80, y, W - 160, 150, 24);
    ctx.fill();
    ctx.fillStyle = primary;
    ctx.font = `700 30px ${sans}`;
    ctx.fillText(`🏆 ${h.title} · ${h.name}`.slice(0, 60), 112, y + 52);
    ctx.fillStyle = text;
    ctx.font = `400 28px ${sans}`;
    wrap(ctx, h.text, W - 224, 2).forEach((line, i) => ctx.fillText(line, 112, y + 96 + i * 36));
    y += 170;
  }
  if (highlights.length === 0) {
    const rest = input.ranked.slice(0, 8);
    ctx.fillStyle = muted;
    ctx.font = `700 26px ${sans}`;
    ctx.fillText("CLASSIFICAÇÃO FINAL", 112, y + 10);
    y += 30;
    ctx.font = `600 32px ${sans}`;
    for (const row of rest) {
      ctx.fillStyle = muted;
      ctx.fillText(`${row.place}º`, 112, y + 40);
      ctx.fillStyle = text;
      ctx.fillText(row.nickname, 190, y + 40);
      ctx.textAlign = "right";
      ctx.fillText(`${row.score}`, W - 112, y + 40);
      ctx.textAlign = "left";
      y += 60;
    }
  }
  if (input.summary && y < H - 200) {
    ctx.fillStyle = muted;
    ctx.font = `italic 400 30px ${sans}`;
    wrap(ctx, `“${input.summary}”`, W - 160, 3).forEach((line, i) => ctx.fillText(line, 80, y + 40 + i * 40));
  }

  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = `600 28px ${sans}`;
  ctx.fillText("Joga com a gente: stopia.lovable.app", W / 2, H - 56);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem."))), "image/png"));
}

/** Shares the image (WhatsApp etc.) when the device can, otherwise downloads it. */
export async function shareImage(blob: Blob, filename: string, text: string) {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return "shared" as const;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
  return "downloaded" as const;
}
