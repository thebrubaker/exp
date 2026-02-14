import { motion } from "motion/react";
import { useState } from "react";

export function StickyHeader({ installCmd }: { installCmd: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(10, 10, 10, 0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* exp wordmark — layoutId morphs from hero */}
      <motion.span
        layoutId="exp-title"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 20,
          fontWeight: 700,
          color: "var(--accent)",
        }}
        transition={{ type: "spring", duration: 0.6, bounce: 0.15 }}
      >
        exp
      </motion.span>

      {/* Install command — layoutId morphs from hero */}
      <motion.div
        layoutId="install-cmd"
        onClick={handleCopy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "6px 14px",
          cursor: "pointer",
        }}
        transition={{ type: "spring", duration: 0.6, bounce: 0.15 }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          $
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text)",
          }}
        >
          {installCmd}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: copied ? "var(--accent)" : "var(--text-muted)",
            marginLeft: 4,
          }}
        >
          {copied ? "copied!" : "copy"}
        </span>
      </motion.div>
    </motion.header>
  );
}
