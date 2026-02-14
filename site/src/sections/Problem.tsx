import { FadeIn } from "../components/FadeIn";

export function Problem() {
  return (
    <section
      style={{
        padding: "120px 24px",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <FadeIn>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(24px, 4vw, 36px)",
            fontWeight: 500,
            lineHeight: 1.4,
            color: "var(--text)",
          }}
        >
          Your agents keep stepping on each other.
        </p>
      </FadeIn>

      <FadeIn delay={0.15}>
        <div
          style={{
            width: 40,
            height: 2,
            background: "var(--accent)",
            margin: "32px 0",
            opacity: 0.5,
          }}
        />
      </FadeIn>

      <FadeIn delay={0.25}>
        <p
          style={{
            fontSize: 17,
            color: "var(--text-muted)",
            lineHeight: 1.7,
            maxWidth: 560,
          }}
        >
          Shared state. Branch conflicts. Serial bottlenecks. When you need
          three agents working on three features, git worktrees are too fiddly
          and branches don't give you real isolation. You need full copies —
          fast.
        </p>
      </FadeIn>
    </section>
  );
}
