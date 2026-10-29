/** Browser-safe comic nickname generator for the "dice" button next to nickname fields (max 20 chars). */
const FIRST = ["Capivara", "Tio", "Dona", "Mestre", "Lenda", "Barão", "Rainha", "Ninja", "Pastel", "Sargento", "Doutor", "Coxinha", "Fera", "Brabo", "Duquesa"];
const SECOND = ["Veloz", "do Caos", "Sincero", "Turbo", "da Zoeira", "Furioso", "Chique", "Sem Freio", "Raiz", "Nutella", "do Pagode", "Ligeiro", "Blefador", "Supremo", "da Firma"];

export const NICKNAME_MAX = 20;

export function randomNickname(random: () => number = Math.random, avoid?: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const first = FIRST[Math.floor(random() * FIRST.length)] ?? FIRST[0]!;
    const second = SECOND[Math.floor(random() * SECOND.length)] ?? SECOND[0]!;
    const name = `${first} ${second}`;
    if (name.length <= NICKNAME_MAX && name !== avoid) return name;
  }
  return FIRST[0]!;
}
