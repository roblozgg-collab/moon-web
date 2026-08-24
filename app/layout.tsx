import type { Metadata } from "next";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME, withBasePath } from "@/lib/config";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  icons: { icon: withBasePath("/logo.png"), apple: withBasePath("/logo.png") },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
