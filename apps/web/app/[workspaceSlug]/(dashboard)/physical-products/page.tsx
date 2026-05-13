import { auth } from "../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import ProductsListClient from "../../../../components/physical-products/ProductsListClient";

export const metadata = { title: "Physical products" };

export default async function ProductsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  const total = await db.physicalProduct.count({ where: { workspaceId } });

  return (
    <div className="flex flex-col h-full">
      <ProductsListClient initialTotal={total} />
    </div>
  );
}
