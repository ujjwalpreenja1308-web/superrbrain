import { useAuth } from "@/hooks/useAuth";

const HOME_URL =
  import.meta.env.VITE_HOME_URL ||
  (import.meta.env.PROD ? "https://home.covable.app" : "http://localhost:5173");

const DODO_PRODUCTS: Record<string, string> = {
  starter: import.meta.env.VITE_DODO_PRODUCT_STARTER_MONTHLY ?? "",
  growth:  import.meta.env.VITE_DODO_PRODUCT_GROWTH_MONTHLY  ?? "",
  pro:     import.meta.env.VITE_DODO_PRODUCT_PRO_MONTHLY     ?? "",
};

function buildCheckoutUrl(plan: string, email: string, userId: string): string {
  const productId = DODO_PRODUCTS[plan];
  if (!productId) return "#";
  const params = new URLSearchParams({
    email,
    "metadata[user_id]": userId,
    redirect_url: `${HOME_URL}?payment=success`,
    cancel_url:   `${HOME_URL}?payment=cancelled`,
  });
  return `https://checkout.dodopayments.com/buy/${productId}?${params.toString()}`;
}

function handlePlanClick() {
  sessionStorage.setItem("plan_chooser_dismissed", "1");
}

export function PlanChooser({ onSkip }: { onSkip?: () => void }) {
  const { user } = useAuth();
  const email  = user?.email  ?? "";
  const userId = user?.id     ?? "";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A09",
        color: "#F0EFE8",
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        fontWeight: 300,
        fontSize: 15,
        lineHeight: 1.8,
        WebkitFontSmoothing: "antialiased",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "72px 24px 80px",
      }}
    >
      {/* Logo */}
      <a
        href="https://covable.app"
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 56, textDecoration: "none" }}
      >
        <img src="/logo.svg" alt="Covable" width={26} height={26} />
      </a>

      {/* Heading */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "#C8F53C", marginBottom: 12 }}>
          One last step
        </p>
        <h1 style={{ fontFamily: "'PP Editorial New', serif", fontWeight: 200, fontSize: "clamp(28px, 5vw, 42px)", lineHeight: 1.15, marginBottom: 12 }}>
          Choose your plan
        </h1>
        <p style={{ color: "#8A8A82", fontSize: 14 }}>
          Cancel anytime · No hidden fees · Starter includes 3-day free trial
        </p>
      </div>

      {/* Pricing table */}
      <div style={{ width: "100%", maxWidth: 860, overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid #252522",
          fontSize: 13,
          fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          textAlign: "left",
        }}>
          <thead>
            <tr>
              <th style={{ width: "38%", ...thStyle }}></th>
              <th style={thStyle}>Starter</th>
              <th style={{ ...thStyle, background: "#1A200A", borderColor: "#C8F53C", color: "#C8F53C" }}>
                Growth{" "}
                <span style={{ background: "rgba(200,245,60,0.15)", color: "#C8F53C", padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, marginLeft: 6, verticalAlign: "middle" }}>
                  Popular
                </span>
              </th>
              <th style={thStyle}>Pro</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...tdStyle, color: "#8A8A82", fontWeight: 400 }}>What you get</td>
              <td style={tdStyle}><span style={{ fontSize: 12, color: "#8A8A82" }}>Quick brand checks</span></td>
              <td style={featuredTd}><span style={{ fontSize: 12, color: "#8A8A82" }}>Track trends &amp; conversations</span></td>
              <td style={tdStyle}><span style={{ fontSize: 12, color: "#8A8A82" }}>Full visibility + competitor insights</span></td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, color: "#8A8A82", fontWeight: 400 }}>Monthly price</td>
              <td style={tdStyle}><span style={{ fontSize: 22, fontWeight: 700 }}>$9</span><span style={{ color: "#8A8A82", fontSize: 12 }}>/mo</span></td>
              <td style={{ ...featuredTd, color: "#C8F53C" }}><span style={{ fontSize: 22, fontWeight: 700 }}>$29</span><span style={{ color: "#8A8A82", fontSize: 12 }}>/mo</span></td>
              <td style={tdStyle}><span style={{ fontSize: 22, fontWeight: 700 }}>$79</span><span style={{ color: "#8A8A82", fontSize: 12 }}>/mo</span></td>
            </tr>
            <Row label="AI prompts / month" starter="10" growth="30" pro="60" />
            <CheckRow label="ChatGPT response analysis" starter growth pro />
            <tr>
              <td style={{ ...tdStyle, color: "#8A8A82", fontWeight: 400 }}>
                Reddit tracking
                <div style={{ fontSize: 10, color: "#8A8A82", opacity: 0.5, fontWeight: 400, marginTop: 2 }}>Track what people are saying about your brand and keywords</div>
              </td>
              <td style={tdStyle}><span style={{ color: "#4A4A44" }}>×</span></td>
              <td style={featuredTd}><span style={{ color: "#C8F53C" }}>✓</span></td>
              <td style={tdStyle}><span style={{ color: "#C8F53C" }}>✓</span></td>
            </tr>
            <Row label="Reddit keywords tracked" starter="—" growth="5" pro="10" starterMuted />
            <Row label="Subreddits monitored" starter="—" growth="2" pro="4" starterMuted />
            <Row label="Max Reddit posts tracked / month" starter="—" growth="~200" pro="800+" starterMuted />
            <Row label="Support" starter="Email" growth="Priority" pro="Dedicated" />
            {/* CTAs */}
            <tr>
              <td style={tdStyle}></td>
              <td style={tdStyle}>
                <a
                  href={buildCheckoutUrl("starter", email, userId)}
                  onClick={handlePlanClick}
                  style={{ ...btnSecondary, display: "inline-block", padding: "8px 16px", fontSize: 12 }}
                >
                  Start free trial
                </a>
                <div style={{ fontSize: 10, color: "#8A8A82", marginTop: 4 }}>3 days free · card required</div>
              </td>
              <td style={featuredTd}>
                <a
                  href={buildCheckoutUrl("growth", email, userId)}
                  onClick={handlePlanClick}
                  style={{ ...btnPrimary, display: "inline-block", padding: "8px 16px", fontSize: 12 }}
                >
                  Start tracking
                </a>
              </td>
              <td style={tdStyle}>
                <a
                  href={buildCheckoutUrl("pro", email, userId)}
                  onClick={handlePlanClick}
                  style={{ ...btnSecondary, display: "inline-block", padding: "8px 16px", fontSize: 12, background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "#fff", border: "none" }}
                >
                  Go Pro
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 32, fontSize: 12, color: "#4A4A44", textAlign: "center" }}>
        Payments processed securely by Dodo Payments.{" "}
        <a href="mailto:support@covable.app" style={{ color: "#8A8A82", textDecoration: "underline", textUnderlineOffset: 2 }}>
          Questions?
        </a>
      </p>

      {onSkip && (
        <button
          onClick={onSkip}
          style={{ marginTop: 20, fontSize: 12, color: "#4A4A44", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
        >
          Skip for now, explore the dashboard
        </button>
      )}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  border: "1px solid #252522",
  padding: "16px 20px",
  fontSize: 13,
  fontWeight: 500,
  background: "#1A1A18",
  color: "#F0EFE8",
  textAlign: "left",
  fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #252522",
  padding: "16px 20px",
  fontSize: 13,
  fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  textAlign: "left",
  color: "#F0EFE8",
};

const featuredTd: React.CSSProperties = {
  ...tdStyle,
  borderLeftColor: "#C8F53C",
  borderRightColor: "#C8F53C",
};

const btnPrimary: React.CSSProperties = {
  background: "#C8F53C",
  color: "#0A0A09",
  fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  fontWeight: 500,
  letterSpacing: "0.04em",
  borderRadius: 4,
  border: "none",
  cursor: "pointer",
  textDecoration: "none",
};

const btnSecondary: React.CSSProperties = {
  background: "transparent",
  color: "#8A8A82",
  fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  fontWeight: 500,
  letterSpacing: "0.04em",
  borderRadius: 4,
  border: "1px solid #3A3A36",
  cursor: "pointer",
  textDecoration: "none",
};

// ── Helper row components ──────────────────────────────────────────────────────

function Row({ label, starter, growth, pro, starterMuted }: {
  label: string;
  starter: string;
  growth: string;
  pro: string;
  starterMuted?: boolean;
}) {
  return (
    <tr>
      <td style={{ ...tdStyle, color: "#8A8A82", fontWeight: 400 }}>{label}</td>
      <td style={{ ...tdStyle, ...(starterMuted ? { color: "#8A8A82" } : {}) }}>{starter}</td>
      <td style={featuredTd}>{growth}</td>
      <td style={tdStyle}>{pro}</td>
    </tr>
  );
}

function CheckRow({ label, starter, growth, pro }: {
  label: string;
  starter?: boolean;
  growth?: boolean;
  pro?: boolean;
}) {
  return (
    <tr>
      <td style={{ ...tdStyle, color: "#8A8A82", fontWeight: 400 }}>{label}</td>
      <td style={tdStyle}><span style={{ color: starter ? "#C8F53C" : "#4A4A44" }}>{starter ? "✓" : "×"}</span></td>
      <td style={featuredTd}><span style={{ color: growth ? "#C8F53C" : "#4A4A44" }}>{growth ? "✓" : "×"}</span></td>
      <td style={tdStyle}><span style={{ color: pro ? "#C8F53C" : "#4A4A44" }}>{pro ? "✓" : "×"}</span></td>
    </tr>
  );
}
