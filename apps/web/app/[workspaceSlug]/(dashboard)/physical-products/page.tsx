import { db } from "@launchtic/database";
import ProductsListClient from "../../../../components/physical-products/ProductsListClient";

import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
export const metadata = { title: "Physical products" };

export default async function ProductsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "products:read");

  const total = await db.physicalProduct.count({ where: { workspaceId } });

  return (
    <div className="flex flex-col h-full">
      <ProductsListClient initialTotal={total} />
    </div>
  );
}
