import "./globals.css";
import { ToastContainer } from "../components/Toast";
import { AuthModal } from "../components/AuthModal";
import { AuthHydrator } from "../components/AuthHydrator";

export const metadata = {
  title: "SteadyPost - AI Content Studio for Instagram & Facebook",
  description:
    "Draft content, generate AI-assisted captions and hashtags, and publish instantly to Instagram and Facebook.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        <AuthHydrator />
        {children}
        <ToastContainer />
        <AuthModal />
      </body>
    </html>
  );
}
