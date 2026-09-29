import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Polar Link",
  description: "Expedition logistics and resupply planning for Maitri Station",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
