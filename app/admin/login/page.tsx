import React from "react";

export const dynamic = "force-dynamic";

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams?: { error?: string; next?: string };
}) {
  const hasError = searchParams?.error === "1";
  const next = searchParams?.next?.startsWith("/admin") ? searchParams.next : "/admin";

  return (
    <div style={{
      minHeight: "calc(100vh - 42px)",
      background: "var(--paper)",
      color: "var(--ledger-ink)",
      fontFamily: "'Courier Prime', monospace",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <form action="/admin/login/submit" method="post" style={{
        width: "min(360px, 100%)",
        border: "1px solid var(--rule)",
        borderTop: "3px solid var(--ledger-ink)",
        padding: "24px 26px",
      }}>
        <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--ledger-ink-faint)", marginBottom: 4 }}>
          ADMIN
        </div>
        <h1 style={{ fontSize: 18, letterSpacing: "0.14em", margin: "0 0 18px", fontWeight: 900 }}>
          LOGIN
        </h1>
        <label style={{
          display: "block",
          fontSize: 9,
          letterSpacing: "0.16em",
          color: "var(--ledger-ink-faint)",
          marginBottom: 6,
          textTransform: "uppercase",
        }}>
          Password
        </label>
        <input
          type="hidden"
          name="next"
          value={next}
        />
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            color: "var(--ledger-ink)",
            padding: "9px 11px",
            fontSize: 13,
            fontFamily: "'Courier Prime', monospace",
            marginBottom: 12,
          }}
        />
        {hasError && (
          <div style={{
            color: "#b42318",
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.08em",
            marginBottom: 12,
          }}>
            INVALID ADMIN PASSWORD
          </div>
        )}
        <button type="submit" style={{
          width: "100%",
          padding: "10px 0",
          background: "var(--ledger-ink)",
          border: "none",
          color: "var(--paper)",
          fontSize: 11,
          fontWeight: 900,
          cursor: "pointer",
          letterSpacing: "0.14em",
        }}>
          SIGN IN
        </button>
      </form>
    </div>
  );
}
