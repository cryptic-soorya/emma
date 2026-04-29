import "./globals.css"; // This MUST be here
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import CursorSparkles from "./components/CursorSparkles";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mika 2.0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ cursor: "none" }}>
        <CursorSparkles />
        {children}
      </body>
    </html>
  );
}