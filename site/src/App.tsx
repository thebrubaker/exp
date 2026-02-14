import { useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { Hero } from "./sections/Hero";
import { Problem } from "./sections/Problem";
import { TheFork } from "./sections/TheFork";
import { TheUnlock } from "./sections/TheUnlock";
import { GetStarted } from "./sections/GetStarted";
import { StickyHeader } from "./components/StickyHeader";

function App() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 300);
  });

  return (
    <LayoutGroup>
      <main>
        <AnimatePresence>
          {scrolled && (
            <StickyHeader installCmd="brew install digitalpine/tap/exp" />
          )}
        </AnimatePresence>

        <Hero visible={!scrolled} />
        <Problem />
        <TheFork />
        <TheUnlock />
        <GetStarted />
      </main>
    </LayoutGroup>
  );
}

export default App;
