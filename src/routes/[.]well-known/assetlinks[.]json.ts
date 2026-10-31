import { createFileRoute } from "@tanstack/react-router";

/**
 * Digital Asset Links for the Android app (Trusted Web Activity). The package name comes from the
 * billing settings default; the signing certificate fingerprints come from the ANDROID_SHA256_FINGERPRINTS
 * secret (comma-separated, from Play Console → App integrity). Without it the list is empty.
 */
export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: {
    handlers: {
      GET: async () => {
        const { DEFAULT_BILLING } = await import("@/lib/billing");
        const fingerprints = (process.env["ANDROID_SHA256_FINGERPRINTS"] ?? "")
          .split(",")
          .map((f) => f.trim().toUpperCase())
          .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
        const body = fingerprints.length
          ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: process.env["ANDROID_PACKAGE_NAME"] ?? DEFAULT_BILLING.androidPackage, sha256_cert_fingerprints: fingerprints } }]
          : [];
        return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
      },
    },
  },
});
