import "./globals.css";
import { ToastContainer } from "../components/ui/Toast";
import { AuthModal } from "../components/AuthModal";
import { AuthHydrator } from "../components/AuthHydrator";

/*
 * SteadyPost — warm-paper editorial enterprise theme.
 * Type system (template-matched):
 *   Instrument Serif  display / page titles
 *   DM Sans           UI & body
 *   DM Mono           labels, tags, numerals, metadata
 */
export const metadata = {
  title: "SteadyPost — Content Studio for Instagram & Facebook",
  description:
    "Draft content, generate AI-assisted captions and hashtags, and publish to Instagram and Facebook from one calm workspace.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <AuthHydrator />
        {children}
        <ToastContainer />
        <AuthModal />
      </body>
    </html>
  );
}
