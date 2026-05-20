// Visitor-facing 404 for the renderer. This is served on the customer's
// own domain (e.g. mybrand.com/whatever) when no funnel step matches the
// slug — so we deliberately avoid loud launchtic branding. Just a clean,
// generic page that doesn't expose what platform powers the site.
//
// No "Back" link: we don't know what the host considers a safe landing
// page, and linking back to launchtic would be confusing for the visitor
// who arrived from a Facebook ad or email and has no idea who we are.

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#fafafa",
        color: "#111827",
        fontFamily: "'Open Sans', sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "440px" }}>
        <p
          style={{
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#6b7280",
            marginBottom: "12px",
          }}
        >
          404
        </p>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            marginBottom: "12px",
            letterSpacing: "-0.02em",
            color: "#111827",
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            color: "#6b7280",
            lineHeight: 1.6,
            fontSize: "15px",
          }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
    </main>
  );
}
