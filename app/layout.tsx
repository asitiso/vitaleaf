import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "바이탈리프 | 건강을 고르는 새로운 기준",
  description: "성분부터 섭취까지, 내 건강에 맞는 기준으로 고르는 건강기능식품.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <Providers>
          <SiteHeader />
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
