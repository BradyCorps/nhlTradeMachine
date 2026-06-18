import React from "react";

const NAV_LINKS = [
  { href: "/admin",             label: "DASHBOARD"   },
  { href: "/admin/contracts",   label: "CONTRACTS"   },
  { href: "/admin/teams",       label: "TEAMS"       },
  { href: "/admin/trade-block", label: "TRADE BLOCK" },
  { href: "/admin/settings",    label: "SETTINGS"    },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav style={{
        background: "var(--ledger-ink)",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        height: 42,
        position: "sticky",
        top: 0,
        zIndex: 50,
        fontFamily: "'Courier Prime', monospace",
      }}>
        <span style={{
          color: "var(--paper)",
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: "0.3em",
          marginRight: 20,
          opacity: 0.7,
          whiteSpace: "nowrap",
        }}>
          THE HOCKEY LEDGER
        </span>
        <span style={{ color: "rgba(255,255,255,0.18)", marginRight: 20, fontSize: 14 }}>|</span>
        <div style={{ display: "flex", alignItems: "stretch", height: "100%", gap: 2 }}>
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              style={{
                color: "rgba(255,255,255,0.58)",
                fontSize: 9,
                fontWeight: 900,
                textDecoration: "none",
                letterSpacing: "0.18em",
                padding: "0 12px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {label}
            </a>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <a
          href="/armchair-gm"
          style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: 9,
            textDecoration: "none",
            letterSpacing: "0.12em",
          }}
        >
          ← ARMCHAIR GM
        </a>
      </nav>
      {children}
    </>
  );
}
