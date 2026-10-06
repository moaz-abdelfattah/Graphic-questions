import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://mistara-2d-geometry-tool.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "مِسطرة — محرر الرسومات الهندسية العربية",
  description: "أنشئ رسومات هندسية ثنائية الأبعاد دقيقة برموز وأرقام عربية، وصدّرها بصيغة PNG أو SVG.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "مِسطرة — محرر الرسومات الهندسية العربية",
    description: "رسومات هندسية ثنائية الأبعاد دقيقة، برموز وأرقام عربية.",
    locale: "ar_EG",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "مِسطرة — محرر الرسومات الهندسية العربية" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "مِسطرة",
    description: "محرر الرسومات الهندسية العربية",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
