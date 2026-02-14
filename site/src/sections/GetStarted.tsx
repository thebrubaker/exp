import { FadeIn } from "../components/FadeIn";
import { CodeBlock } from "../components/CodeBlock";

export function GetStarted() {
  return (
    <section
      style={{
        padding: "120px 24px 80px",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <FadeIn>
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(20px, 3vw, 28px)",
            fontWeight: 500,
            marginBottom: 32,
          }}
        >
          Get started
        </h2>
      </FadeIn>

      <FadeIn delay={0.1}>
        <CodeBlock>
          {`# Install
brew install digitalpine/tap/exp

# One-time setup
exp init

# Fork and go
exp new "try redis caching"    # Fork + terminal + git branch
# ...work freely...
exp trash 1                    # Done? Toss it.`}
        </CodeBlock>
      </FadeIn>

      {/* Commands reference */}
      <FadeIn delay={0.2}>
        <div style={{ marginTop: 48 }}>
          <h3
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              fontWeight: 500,
              color: "var(--text-muted)",
              marginBottom: 20,
            }}
          >
            Commands
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 1,
              background: "var(--border)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {[
              ["exp new", "Fork project with git branch"],
              ["exp ls", "List forks with diverged size"],
              ["exp diff", "What changed vs original"],
              ["exp trash", "Delete a fork"],
              ["exp open", "Open terminal in fork"],
              ["exp nuke", "Delete all forks"],
            ].map(([cmd, desc]) => (
              <div
                key={cmd}
                style={{
                  background: "var(--bg-card)",
                  padding: "14px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--accent)",
                  }}
                >
                  {cmd}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                  }}
                >
                  {desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* Footer */}
      <FadeIn delay={0.3}>
        <div
          style={{
            marginTop: 80,
            paddingTop: 32,
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                fontWeight: 500,
                color: "var(--accent)",
              }}
            >
              exp
            </span>
            <span
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginLeft: 12,
              }}
            >
              Requires macOS with APFS
            </span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <a
              href="https://github.com/thebrubaker/exp"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
              }}
            >
              GitHub
            </a>
            <a
              href="https://github.com/thebrubaker/exp/releases"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
              }}
            >
              Releases
            </a>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              MIT License
            </span>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
