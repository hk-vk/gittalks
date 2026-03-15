import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "GitTalks editorial hero artwork";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";
export const runtime = "nodejs";

const popularTalks = [
  { repo: "github/copilot-cli", description: "GitHub Copilot in the terminal", stars: "21.4k" },
  { repo: "vercel/next.js", description: "The React Framework for the Web", stars: "131k" },
];

export default async function OpenGraphImage() {
  const [instrumentSerifRegular, instrumentSerifItalic] = await Promise.all([
    readFile(path.join(process.cwd(), "app/fonts/InstrumentSerif-Regular.ttf")),
    readFile(path.join(process.cwd(), "app/fonts/InstrumentSerif-Italic.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          color: "#e8e8e8",
          overflow: "hidden",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 18% 22%, rgba(0,255,136,0.14), transparent 30%), radial-gradient(circle at 82% 14%, rgba(255,255,255,0.05), transparent 20%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "0 auto 0 0",
            width: 1,
            background: "rgba(255,255,255,0.03)",
            left: 88,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 78,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(10, 10, 10, 0.82)",
          }}
        >
          <div
            style={{
              width: 1024,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", fontSize: 30, letterSpacing: -1 }}>
              <span style={{ fontFamily: "Instrument Serif" }}>Git</span>
              <span style={{ fontFamily: "Instrument Serif", fontStyle: "italic", color: "#00ff88" }}>
                talks
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 34, color: "#7b7b7b", fontSize: 17 }}>
              <span>Explore</span>
              <span>About</span>
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid #333333",
                  background: "#141414",
                  color: "#d0d0d0",
                }}
              >
                Sign in
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            paddingTop: 118,
            paddingLeft: 88,
            paddingRight: 88,
          }}
        >
          <div
            style={{
              width: 1024,
              display: "flex",
              flexDirection: "column",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  fontFamily: "Instrument Serif",
                  fontSize: 92,
                  lineHeight: 0.95,
                  letterSpacing: -3.6,
                }}
              >
                <span>Listen to</span>
                <span style={{ color: "#00ff88", fontFamily: "Instrument Serif", fontStyle: "italic" }}>
                  repositories
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  maxWidth: 650,
                  marginTop: 26,
                  color: "#8a8a8a",
                  fontSize: 28,
                  lineHeight: 1.38,
                }}
              >
                Transform any GitHub repository into an immersive audio experience. AI-generated podcast
                episodes that explain architecture, design decisions, and code.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 42,
                flexDirection: "column",
                width: 760,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                  borderRadius: 18,
                  background: "#090909",
                  border: "1px solid #27272a",
                  padding: "12px 14px 12px 24px",
                  boxShadow: "0 24px 80px rgba(0,0,0,0.38)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    alignItems: "center",
                    color: "#5f5f5f",
                    fontSize: 25,
                    letterSpacing: -0.4,
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  }}
                >
                  github.com/owner/repo
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 18px",
                    borderRadius: 12,
                    border: "1px solid rgba(16,185,129,0.5)",
                    background: "rgba(16,185,129,0.1)",
                    color: "#34d399",
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    fontSize: 15,
                    letterSpacing: 2.8,
                    textTransform: "uppercase",
                  }}
                >
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderTop: "6px solid transparent",
                      borderBottom: "6px solid transparent",
                      borderLeft: "10px solid #34d399",
                    }}
                  />
                  <span>Generate</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
                <span style={{ color: "#666666", fontSize: 17 }}>Try:</span>
                {["github/copilot-cli", "vercel/next.js", "facebook/react"].map((repo) => (
                  <div
                    key={repo}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "9px 14px",
                      borderRadius: 9999,
                      background: "#1a1a1a",
                      border: "1px solid #2a2a2a",
                      color: "#888888",
                      fontSize: 16,
                      fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    }}
                  >
                    {repo}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", marginTop: 58 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <div style={{ fontFamily: "Instrument Serif", fontSize: 42, letterSpacing: -1.6 }}>Popular Talks</div>
                <div style={{ color: "#555555", fontSize: 18 }}>Discover trending repositories</div>
              </div>

              <div style={{ display: "flex", gap: 18, marginTop: 22 }}>
                {popularTalks.map((talk) => (
                  <div
                    key={talk.repo}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: 500,
                      padding: "22px 24px",
                      borderRadius: 24,
                      border: "1px solid #1a1a1a",
                      background: "#0c0c0c",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", maxWidth: 360 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 24, fontWeight: 600 }}>{talk.repo}</span>
                        <span
                          style={{
                            color: "#555555",
                            fontSize: 16,
                            fontFamily: "ui-monospace, SFMono-Regular, monospace",
                          }}
                        >
                          ★ {talk.stars}
                        </span>
                      </div>
                      <span style={{ marginTop: 8, color: "#666666", fontSize: 17 }}>{talk.description}</span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        width: 44,
                        height: 44,
                        borderRadius: 9999,
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#111111",
                        border: "1px solid #1a1a1a",
                      }}
                    >
                      <div
                        style={{
                          width: 0,
                          height: 0,
                          marginLeft: 4,
                          borderTop: "7px solid transparent",
                          borderBottom: "7px solid transparent",
                          borderLeft: "11px solid #00ff88",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
    {
      fonts: [
        {
          name: "Instrument Serif",
          data: instrumentSerifRegular,
          style: "normal",
          weight: 400,
        },
        {
          name: "Instrument Serif",
          data: instrumentSerifItalic,
          style: "italic",
          weight: 400,
        },
      ],
    },
  );
}
