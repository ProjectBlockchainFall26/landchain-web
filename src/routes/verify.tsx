// Verify a Title is now the list view of the Land Register (/?view=list). Old links still work.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/verify")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { view: "list" } });
  },
});
