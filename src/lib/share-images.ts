/**
 * Template share cards (1200x630) per game, served from the app's asset CDN. Link previews need an
 * absolute URL, so they are anchored to the published address. No room data is printed on them.
 */
import autor from "@/assets/og/autor.jpg.asset.json";
import debate from "@/assets/og/debate.jpg.asset.json";
import home from "@/assets/og/home.jpg.asset.json";
import infiltrado from "@/assets/og/infiltrado.jpg.asset.json";
import roleta from "@/assets/og/roleta.jpg.asset.json";
import stop from "@/assets/og/stop.jpg.asset.json";
import tribunal from "@/assets/og/tribunal.jpg.asset.json";

export const PUBLIC_ORIGIN = "https://stopia.lovable.app";

const absolute = (url: string) => (url.startsWith("http") ? url : `${PUBLIC_ORIGIN}${url}`);

const BY_GAME: Record<string, string> = {
  lobby: absolute(home.url),
  stop: absolute(stop.url),
  tribunal: absolute(tribunal.url),
  debate: absolute(debate.url),
  autor: absolute(autor.url),
  infiltrado: absolute(infiltrado.url),
  roleta: absolute(roleta.url),
};

export const HOME_SHARE_IMAGE = BY_GAME["lobby"]!;

export function shareImageFor(game: string | null | undefined) {
  return BY_GAME[game ?? "lobby"] ?? HOME_SHARE_IMAGE;
}

/** Local (same-origin) path of the card, for drawing it inside the app. */
export function localShareImageFor(game: string | null | undefined) {
  const map: Record<string, string> = { lobby: home.url, stop: stop.url, tribunal: tribunal.url, debate: debate.url, autor: autor.url, infiltrado: infiltrado.url, roleta: roleta.url };
  return map[game ?? "lobby"] ?? home.url;
}
