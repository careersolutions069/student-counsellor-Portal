"use client";
// Shown only if the root layout itself fails. Keep it plain: no technical details for users.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf6ee", color: "#142d3b" }}>
        <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 20px" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>This page is temporarily unavailable</h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.5 }}>
            Something went wrong while loading The Career Solutions. Check your internet connection and try again.
          </p>
          <button onClick={reset} style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, border: 0, background: "#0f766e", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
