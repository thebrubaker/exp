import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { FadeIn } from "../components/FadeIn";

function AnimatedStat({
  value,
  label,
  delay,
}: {
  value: string;
  label: string;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 15 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      style={{ textAlign: "center" }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "clamp(32px, 5vw, 48px)",
          fontWeight: 700,
          color: "var(--accent)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--text-muted)",
          marginTop: 8,
        }}
      >
        {label}
      </div>
    </motion.div>
  );
}

export function TheFork() {
  return (
    <section
      style={{
        padding: "80px 24px 120px",
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
            marginBottom: 12,
          }}
        >
          One command. Full copy. Near-zero cost.
        </h2>
        <p
          style={{
            fontSize: 15,
            color: "var(--text-muted)",
            marginBottom: 40,
            maxWidth: 520,
          }}
        >
          APFS copy-on-write cloning gives you a full project copy — .env,
          .git, node_modules, everything — in under a second.
        </p>
      </FadeIn>

      {/* Demo GIF */}
      <FadeIn delay={0.1}>
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 56,
          }}
        >
          <img
            src="demos/demo.gif"
            alt="exp demo — creating forks"
            style={{
              width: "100%",
              display: "block",
            }}
          />
        </div>
      </FadeIn>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 32,
          padding: "40px 0",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <AnimatedStat value="<1s" label="clone time" delay={0} />
        <AnimatedStat value="~0 bytes" label="disk overhead" delay={0.1} />
        <AnimatedStat value="full isolation" label="per fork" delay={0.2} />
      </div>
    </section>
  );
}
