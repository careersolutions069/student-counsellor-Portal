import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Career Solution | Student counselling",
  description:
    "Your counselling, college shortlist and admission journey in one place.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
