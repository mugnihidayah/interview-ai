import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/layout/AuthProvider";
import Navbar from "@/components/layout/Navbar";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Interview AI | AI-Powered Interview Simulator",
  description:
    "Practice interviews with an AI that adapts to your resume, asks smart follow-ups, and gives detailed coaching feedback.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${manrope.variable} ${sora.variable} font-sans bg-background text-foreground`}
      >
        <AuthProvider>
          <Navbar />
          <div className="min-h-screen gradient-bg">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
