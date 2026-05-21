// Server gate wrapper for the Coupons page. The data table + drawer UI is
// a client component (CouponsClient) because it manages search/pagination
// state. The server wrapper enforces the `coupons:read` permission so users
// without it get a 404 (matching the menu-hidden behavior in TopNav).

import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
import CouponsClient from "./CouponsClient";

export const metadata = { title: "Coupons" };

export default async function CouponsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceFromSlug(workspaceSlug, "coupons:read");
  return <CouponsClient />;
}
