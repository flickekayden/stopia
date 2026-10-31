import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Old Stop room links. Those rooms were retired (every game now runs in a group room), so the link
 * sends players to the home screen, where they can create or join a group room.
 */
export const Route = createFileRoute("/sala/$code")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
