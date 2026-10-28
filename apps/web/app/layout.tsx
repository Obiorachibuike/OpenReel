import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "OpenReel AI — Creative workspace",
  description: "Create, edit and render videos with your own media and models.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
