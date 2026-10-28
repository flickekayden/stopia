import { createFileRoute, redirect } from "@tanstack/react-router";

// The games hub moved to the home page; keep old /jogos links working.
export const Route = createFileRoute("/jogos")({
  beforeLoad: () => {
    throw redirect({ to: "/", statusCode: 301 });
  },
});
