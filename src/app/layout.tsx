import type { Metadata } from "next";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: "Login | PlexTech - Berkeley",
  description: "PlexTech - Berkeley recruitment portal",
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
      className="h-full antialiased"
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('theme');
            if (t !== 'dark') {
              var el = document.documentElement;
              el.setAttribute('data-theme', 'light');
              el.style.setProperty('--bg-base',        '#fffaf6');
              el.style.setProperty('--bg-surface',     '#ffffff');
              el.style.setProperty('--bg-raised',      '#fff3ec');
              el.style.setProperty('--bg-active',      '#ffe5d7');
              el.style.setProperty('--border',         '#eadfd8');
              el.style.setProperty('--text-primary',   '#241b2b');
              el.style.setProperty('--text-secondary', '#514759');
              el.style.setProperty('--text-muted',     '#7d7282');
            }
          } catch(e) {}
        `}} />
      </head>
      <body className="min-h-full flex flex-col"><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
