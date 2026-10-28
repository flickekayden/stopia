import { createFileRoute, redirect } from "@tanstack/react-router";

// Stop is played inside the group room now; old /stop links open the home hub.
export const Route = createFileRoute("/stop")({
  beforeLoad: () => {
    throw redirect({ to: "/", statusCode: 301 });
  },
});
