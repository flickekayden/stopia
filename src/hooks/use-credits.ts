import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { creditCredentials, onAccountChange, wireAuthEvents } from "@/lib/account-client";
import { getMyCredits } from "@/lib/account.functions";
import type { WalletSummary } from "@/lib/billing";

export type CreditsState = {
  status: "loading" | "ready" | "refreshing" | "error";
  summary: WalletSummary | null;
  signedIn: boolean;
};

/**
 * This device's AI balance, always read from the server (never cached in storage). Refreshes when the
 * account changes, when the tab comes back and whenever `refresh` is called after a purchase or match.
 */
export function useMyCredits() {
  const fetchCredits = useServerFn(getMyCredits);
  const [state, setState] = useState<CreditsState>({ status: "loading", summary: null, signedIn: false });
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => (s.status === "loading" ? s : { ...s, status: "refreshing" }));
    try {
      const cred = await creditCredentials();
      if (!cred.accessToken && !cred.guestToken) {
        if (mine === seq.current) setState({ status: "ready", summary: null, signedIn: false });
        return;
      }
      const res = await fetchCredits({ data: cred });
      if (mine === seq.current) setState({ status: "ready", summary: res.summary, signedIn: res.signedIn });
    } catch {
      if (mine === seq.current) setState((s) => ({ ...s, status: "error" }));
    }
  }, [fetchCredits]);

  useEffect(() => {
    void wireAuthEvents();
    void refresh();
    const off = onAccountChange(() => void refresh());
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { ...state, refresh };
}
