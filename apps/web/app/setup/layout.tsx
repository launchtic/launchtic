// Minimal layout for the first-run wizard. No navbar, no auth provider,
// no workspace context — just a centered card on a soft background.
//
// Lives outside the (dashboard) group so none of the dashboard's data
// fetches run before setup is complete. Chrome mirrors the (auth) layout
// for visual continuity — operator boots from install.sh → setup → /login
// without jarring style shifts.

export const metadata = { title: "Setup — Launchtic" };

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      {children}
    </div>
  );
}
