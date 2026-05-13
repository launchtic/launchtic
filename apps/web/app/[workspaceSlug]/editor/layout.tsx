import { auth } from "../../../lib/auth";
import { redirect } from "next/navigation";
import "./editor.css";

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div style={{ margin: 0, padding: 0, overflow: "hidden", height: "100vh" }}>
      {children}
    </div>
  );
}
