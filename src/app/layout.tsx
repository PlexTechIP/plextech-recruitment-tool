import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Delib Tool",
  description: "Consulting club deliberation tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('theme');
            if (t === 'light') {
              var el = document.documentElement;
              el.setAttribute('data-theme', 'light');
              el.style.setProperty('--bg-base',        '#f7f6ff');
              el.style.setProperty('--bg-surface',     '#ffffff');
              el.style.setProperty('--bg-raised',      '#eeedf8');
              el.style.setProperty('--bg-active',      '#e2e0f0');
              el.style.setProperty('--border',         '#d8d5ee');
              el.style.setProperty('--text-primary',   '#18101e');
              el.style.setProperty('--text-secondary', '#374151');
              el.style.setProperty('--text-muted',     '#6b7280');
            }
          } catch(e) {}
        `}} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
