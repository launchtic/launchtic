import type { Metadata } from "next";
import "./globals.css";
import SessionProviderWrapper from "../components/SessionProviderWrapper";

export const metadata: Metadata = {
  title: {
    default: "Launchtic",
    template: "%s — Launchtic",
  },
  description: "Marketing Automation Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
