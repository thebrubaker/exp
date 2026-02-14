import { useState } from "react";

interface CodeBlockProps {
  children: string;
  copyable?: boolean;
}

export function CodeBlock({ children, copyable = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: "relative",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "16px 20px",
        fontFamily: "var(--font-mono)",
        fontSize: 14,
        lineHeight: 1.7,
        overflowX: "auto",
      }}
    >
      <pre style={{ margin: 0 }}>
        <code>{children}</code>
      </pre>
      {copyable && (
        <button
          onClick={handleCopy}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: copied ? "var(--accent-dim)" : "transparent",
            border: `1px solid ${copied ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 4,
            padding: "4px 10px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: copied ? "var(--accent)" : "var(--text-muted)",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      )}
    </div>
  );
}
