import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Friends Voice",
  description: "Private chat + voice app",
  icons: {
    icon: "/app-logo.svg",
    shortcut: "/app-logo.svg",
    apple: "/app-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
