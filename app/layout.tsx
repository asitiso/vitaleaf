import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { resolveSiteOrigin } from "@/lib/site/metadata";
import { Providers } from "./providers";
import "./globals.css";

const title = "바이탈리프 | 건강을 고르는 새로운 기준";
const description = "성분부터 섭취까지, 내 건강에 맞는 기준으로 고르는 건강기능식품.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const origin = resolveSiteOrigin({
    forwardedHost: requestHeaders.get("x-forwarded-host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
    host: requestHeaders.get("host"),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
  const socialImage = `${origin}/og.png`;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: "VITAL LEAF",
      title,
      description,
      images: [{ url: socialImage, width: 1200, height: 630, alt: "VITAL LEAF 건강기능식품" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

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
