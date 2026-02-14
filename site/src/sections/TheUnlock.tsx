import { FadeIn } from "../components/FadeIn";
import { CodeBlock } from "../components/CodeBlock";

export function TheUnlock() {
  return (
    <section
      style={{
        padding: "120px 24px",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <FadeIn>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--accent)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 16,
          }}
        >
          The unlock
        </p>
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(20px, 3vw, 28px)",
            fontWeight: 500,
            marginBottom: 12,
          }}
        >
          Three agents. Three forks. Zero conflicts.
        </h2>
        <p
          style={{
            fontSize: 15,
            color: "var(--text-muted)",
            marginBottom: 40,
            maxWidth: 560,
          }}
        >
          Each agent gets a full directory fork with its own git branch. They
          commit, push, and open PRs independently. Your working branch stays
          untouched.
        </p>
      </FadeIn>

      {/* Orchestration GIF */}
      <FadeIn delay={0.1}>
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 40,
          }}
        >
          <img
            src="demos/demo-orchestration.gif"
            alt="Claude Code orchestrating parallel agents with exp"
            style={{
              width: "100%",
              display: "block",
            }}
          />
        </div>
      </FadeIn>

      {/* Code example */}
      <FadeIn delay={0.2}>
        <CodeBlock>
          {`# Claude dispatches three agents, each in their own fork
exp new "upgrade-turbo" --no-terminal    # Agent 1
exp new "fix-ci" --no-terminal           # Agent 2
exp new "dark-mode" --no-terminal        # Agent 3

# Each agent commits, pushes, opens a PR.
# Your working branch is untouched.`}
        </CodeBlock>
      </FadeIn>
    </section>
  );
}
