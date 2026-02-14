import { useEffect, useState } from "react";

interface TypingTextProps {
  text: string;
  delay?: number;
  speed?: number;
  onComplete?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export function TypingText({
  text,
  delay = 0,
  speed = 40,
  onComplete,
  style,
  className,
}: TypingTextProps) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    if (displayed.length >= text.length) {
      onComplete?.();
      return;
    }
    const timeout = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1));
    }, speed);
    return () => clearTimeout(timeout);
  }, [started, displayed, text, speed, onComplete]);

  return (
    <span className={className} style={style}>
      {displayed}
      {started && displayed.length < text.length && (
        <span
          style={{
            display: "inline-block",
            width: "0.6em",
            height: "1.1em",
            background: "var(--accent)",
            marginLeft: "1px",
            verticalAlign: "text-bottom",
            animation: "blink 1s step-end infinite",
          }}
        />
      )}
    </span>
  );
}
