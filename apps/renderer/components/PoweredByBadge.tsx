"use client";

export default function PoweredByBadge() {
  return (
    <a
      href="https://launchtic.com"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "8px 14px 8px 10px",
        borderRadius: "50px",
        textDecoration: "none",
        boxShadow: "0 4px 16px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)",
        border: "1px solid rgba(255,255,255,0.08)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)";
      }}
    >
      {/* Icon */}
      <div style={{
        width: "30px",
        height: "30px",
        borderRadius: "50%",
        background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="#fff"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
        </svg>
      </div>

      {/* Text */}
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{
          fontSize: "9px",
          color: "rgba(255,255,255,0.5)",
          fontWeight: 400,
          letterSpacing: "0.04em",
          marginBottom: "2px",
        }}>
          Powered by
        </span>
        <span style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "#60a5fa",
          letterSpacing: "-0.01em",
        }}>
          Launchtic
        </span>
      </div>

      {/* Arrow */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </a>
  );
}
