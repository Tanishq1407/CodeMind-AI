import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"), title: { default: "CodeMind AI — Clearer code reviews start here", template: "%s · CodeMind AI" }, description: "Understand code quality with transparent static analysis, useful findings, and reports you can revisit.", openGraph: { title: "CodeMind AI", description: "A thoughtful workspace for code analysis.", type: "website", images: ["/brand/codemind-mark.svg"] }, icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{children:React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
