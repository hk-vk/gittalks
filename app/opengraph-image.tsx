import { ImageResponse } from "next/og";

export const alt = "GitTalks editorial hero artwork";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#0a0a0a",
          color: "#e8e8e8",
          fontFamily: '"Plus Jakarta Sans", sans-serif',
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at top left, rgba(0, 255, 136, 0.16), transparent 34%), radial-gradient(circle at 85% 18%, rgba(255, 255, 255, 0.06), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -80,
            width: 420,
            height: 420,
            borderRadius: 9999,
            border: "1px solid rgba(0, 255, 136, 0.16)",
            opacity: 0.5,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -140,
            left: -100,
            width: 360,
            height: 360,
            borderRadius: 9999,
            border: "1px solid rgba(255, 255, 255, 0.06)",
            opacity: 0.45,
          }}
        />

        <div
          style={{
            display: "flex",
            position: "absolute",
            inset: "0 0 auto 0",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "34px 48px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(10, 10, 10, 0.78)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", fontSize: 34, letterSpacing: -1.4 }}>
            <span style={{ fontFamily: '"Times New Roman", serif' }}>Git</span>
            <span
              style={{
                fontFamily: '"Times New Roman", serif',
                fontStyle: "italic",
                color: "#00ff88",
              }}
            >
              talks
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 26,
              color: "#888888",
              fontSize: 18,
            }}
          >
            <span>Explore</span>
            <span>About</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "100%",
            padding: "126px 72px 56px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 820 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontFamily: '"Times New Roman", serif',
                fontSize: 98,
                lineHeight: 0.95,
                letterSpacing: -4.4,
              }}
            >
              <span>Listen to</span>
              <span
                style={{
                  color: "#00ff88",
                  fontStyle: "italic",
                }}
              >
                repositories
              </span>
            </div>

            <div
              style={{
                marginTop: 28,
                maxWidth: 760,
                color: "#888888",
                fontSize: 30,
                lineHeight: 1.45,
              }}
            >
              Transform any GitHub repository into an immersive audio experience. AI-generated podcast
              episodes that explain architecture, design decisions, and code.
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 44,
                padding: "12px 14px 12px 24px",
                borderRadius: 20,
                background: "#090909",
                border: "1px solid #27272a",
                boxShadow: "0 18px 60px rgba(0, 0, 0, 0.35)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  color: "#5f5f5f",
                  fontSize: 26,
                  letterSpacing: -0.6,
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                github.com/owner/repo
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 20px",
                  borderRadius: 14,
                  background: "rgba(0, 255, 136, 0.1)",
                  border: "1px solid rgba(0, 255, 136, 0.5)",
                  color: "#34d399",
                  fontSize: 16,
                  textTransform: "uppercase",
                  letterSpacing: 3.2,
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                <span
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: "7px solid transparent",
                    borderBottom: "7px solid transparent",
                    borderLeft: "11px solid #34d399",
                  }}
                />
                Generate
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
              <span style={{ color: "#666666", fontSize: 18 }}>Try:</span>
              {["github/copilot-cli", "vercel/next.js", "facebook/react"].map((repo) => (
                <div
                  key={repo}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 16px",
                    borderRadius: 9999,
                    background: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    color: "#888888",
                    fontSize: 17,
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                >
                  {repo}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
