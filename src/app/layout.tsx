import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YoutubeProvider 管理后台",
  description: "运行面板 / 主播设置 / 系统设置",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
