import { motion } from "motion/react";
import { TypingText } from "../components/TypingText";
import { useState } from "react";

export function Hero({ visible }: { visible: boolean }) {
  const [showInstall, setShowInstall] = useState(false);
  const [copied, setCopied] = useState(false);

  const installCmd = "brew install digitalpine/tap/exp";

  const handleCopy = () => {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
        position: "relative",
      }}
    >
      {/* Dot grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(115,115,115,0.15) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          pointerEvents: "none",
        }}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        style={{
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* exp wordmark — layoutId shared with StickyHeader */}
        {visible && (
          <motion.h1
            layoutId="exp-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              layout: { type: "spring", duration: 0.6, bounce: 0.15 },
              opacity: { duration: 0.8 },
              y: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
            }}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(72px, 12vw, 120px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--accent)",
              marginBottom: 24,
            }}
          >
            exp
          </motion.h1>
        )}

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(14px, 2vw, 18px)",
            color: "var(--text-muted)",
            maxWidth: 600,
            margin: "0 auto 48px",
            lineHeight: 1.6,
          }}
        >
          the missing primitive for orchestrating
          <br />
          parallel AI agents
        </motion.p>

        {/* Install command — layoutId shared with StickyHeader */}
        {visible && (
          <motion.div
            layoutId="install-cmd"
            initial={{ opacity: 0, y: 10 }}
            animate={{
              opacity: showInstall ? 1 : 0,
              y: showInstall ? 0 : 10,
            }}
            transition={{
              layout: { type: "spring", duration: 0.6, bounce: 0.15 },
              opacity: { duration: 0.4 },
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "12px 20px",
              cursor: "pointer",
            }}
            onClick={handleCopy}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                color: "var(--text-muted)",
              }}
            >
              $
            </span>
            <TypingText
              text={installCmd}
              delay={800}
              speed={30}
              onComplete={() => setShowInstall(true)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                color: "var(--text)",
              }}
            />
            {showInstall && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: copied ? "var(--accent)" : "var(--text-muted)",
                  marginLeft: 8,
                }}
              >
                {copied ? "copied!" : "click to copy"}
              </span>
            )}
          </motion.div>
        )}

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ delay: 2.5, duration: 1 }}
          style={{
            position: "absolute",
            bottom: -80,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          scroll
        </motion.div>
      </motion.div>

      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </section>
  );
}
