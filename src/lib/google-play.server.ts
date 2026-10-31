/**
 * Google Play Developer API (server only). Purchases made in the Android app are confirmed here with a
 * service account; the browser's word is never trusted. Uses WebCrypto (RS256) so it runs on the edge runtime.
 * Needs the GOOGLE_PLAY_SERVICE_ACCOUNT_JSON secret; without it every verification reports "not configured".
 */
import type { PlayPurchaseResource } from "./billing";

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export class PlayNotConfigured extends Error {
  constructor() {
    super("Compras pela Google Play ainda não foram configuradas no servidor.");
  }
}

function serviceAccount(): ServiceAccount {
  const raw = process.env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"];
  if (!raw) throw new PlayNotConfigured();
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) throw new Error("incomplete");
    return parsed;
  } catch {
    throw new PlayNotConfigured();
  }
}

export function playConfigured() {
  return Boolean(process.env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"]);
}

function base64url(bytes: Uint8Array | string) {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binary = "";
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToBytes(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken() {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToBytes(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` }),
  });
  if (!res.ok) throw new Error(`Google recusou a credencial do servidor (${res.status}).`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function call(path: string, init?: RequestInit) {
  const token = await accessToken();
  return fetch(`${API}/${path}`, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
}

/** The purchase as Google sees it; null when the token does not exist for this product (forged or wrong). */
export async function getProductPurchase(packageName: string, productId: string, purchaseToken: string): Promise<PlayPurchaseResource | null> {
  const res = await call(`${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`);
  if (res.status === 404 || res.status === 400 || res.status === 410) return null;
  if (!res.ok) throw new Error(`A Google Play não respondeu (${res.status}). Tente de novo em instantes.`);
  return (await res.json()) as PlayPurchaseResource;
}

/** Marks a pack as used up on Google's side so the player can buy it again. */
export async function consumeProductPurchase(packageName: string, productId: string, purchaseToken: string) {
  const res = await call(`${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`, { method: "POST" });
  return res.ok;
}

/** Refunded/charged-back purchases from the last 30 days. */
export async function listVoidedPurchases(packageName: string) {
  const start = Date.now() - 30 * 24 * 60 * 60_000;
  const res = await call(`${encodeURIComponent(packageName)}/purchases/voidedpurchases?startTime=${start}&type=0&maxResults=1000`);
  if (!res.ok) throw new Error(`A Google Play não respondeu (${res.status}).`);
  const json = (await res.json()) as { voidedPurchases?: { purchaseToken?: string; orderId?: string }[] };
  return json.voidedPurchases ?? [];
}
