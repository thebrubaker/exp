import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import "./index.css";

// ── Types ──

interface Line {
	text: string;
	color?: string;
	bold?: boolean;
	dim?: boolean;
	delay?: number;
}

interface Segment {
	act: 1 | 2;
	prompt?: string;
	lines: Line[];
	annotation?: string;
}

// ── Act 1 overlay: new terminal in the clone ──

const act1OverlayLines: Line[] = [
	{
		text: ".exp-my-app/001-upgrade-turbo \u276F",
		color: "#58a6ff",
		delay: 400,
	},
];

// ── Act 2 overlays: three agents working in parallel ──

const agentOverlays = [
	{
		title: "\u23FA 001-upgrade-turbo",
		lines: [
			{
				text: "  \u23FA Bash  pnpm up turbo@^2.0",
				color: "#79c0ff",
				bold: true,
				delay: 400,
			},
			{
				text: "    \u2713 turbo 2.0.14",
				color: "#7ee787",
				delay: 500,
			},
			{
				text: "  \u23FA Bash  pnpm build",
				color: "#79c0ff",
				bold: true,
				delay: 400,
			},
			{
				text: "    \u2713 Compiled",
				color: "#7ee787",
				delay: 400,
			},
		] as Line[],
	},
	{
		title: "\u23FA 002-fix-ci",
		lines: [
			{
				text: "  \u23FA Edit .github/workflows/ci.yml",
				color: "#79c0ff",
				bold: true,
				delay: 400,
			},
			{
				text: "    + node-version: ['20', '22']",
				color: "#7ee787",
				delay: 400,
			},
			{
				text: "  \u23FA Bash  act --job build",
				color: "#79c0ff",
				bold: true,
				delay: 400,
			},
			{
				text: "    \u2713 All jobs passed",
				color: "#7ee787",
				delay: 400,
			},
		] as Line[],
	},
	{
		title: "\u23FA 003-dark-mode",
		lines: [
			{
				text: "  \u23FA Edit src/settings/theme.tsx",
				color: "#79c0ff",
				bold: true,
				delay: 400,
			},
			{
				text: "    + useTheme('dark')",
				color: "#7ee787",
				delay: 400,
			},
			{
				text: "  \u23FA Bash  pnpm test settings",
				color: "#79c0ff",
				bold: true,
				delay: 400,
			},
			{
				text: "    \u2713 4 passed",
				color: "#7ee787",
				delay: 400,
			},
		] as Line[],
	},
];

// ── Segments: 5 click-phases across 2 acts ──
//
// Act 1 — The manual flow
//   Phase 0: You're on a branch, run exp new
//   Phase 1: New terminal pops open (overlay)
//
// Act 2 — Now with Claude Code
//   Phase 2: Claude orchestrates 3 experiments
//   Phase 3: Three agent overlays cascade in
//   Phase 4: Three PRs ready

const segments: Segment[] = [
	// Phase 0 (Act 1) — run exp new
	{
		act: 1,
		prompt: 'exp new "upgrade-turbo"',
		annotation: "\u2190 instant full-project clone",
		lines: [
			{ text: "" },
			{
				text: "  \u2713 Cloned my-app via APFS clonefile",
				color: "#7ee787",
				delay: 600,
			},
			{
				text: "  \u2713 001-upgrade-turbo ready \u2014 340ms, 0 bytes",
				color: "#7ee787",
				delay: 400,
			},
			{ text: "", delay: 500 },
			{
				text: "  Opening new terminal\u2026",
				dim: true,
				delay: 400,
			},
		],
	},

	// Phase 1 (Act 1) — overlay appears
	{
		act: 1,
		lines: [],
	},

	// Phase 2 (Act 2) — Claude orchestrates
	{
		act: 2,
		prompt:
			"upgrade turbo, fix CI config, add dark mode \u2014 fork experiments for each",
		lines: [
			{ text: "" },
			{
				text: "  I\u2019ll create three isolated experiments and work in parallel.",
				color: "#e6edf3",
			},
			{ text: "", delay: 500 },
			{
				text: '  \u23FA Bash  exp new "upgrade-turbo" --no-terminal',
				color: "#79c0ff",
				bold: true,
				delay: 400,
			},
			{
				text: "    \u2713 001-upgrade-turbo cloned in 340ms",
				color: "#7ee787",
				delay: 500,
			},
			{ text: "", delay: 300 },
			{
				text: '  \u23FA Bash  exp new "fix-ci" --no-terminal',
				color: "#79c0ff",
				bold: true,
				delay: 400,
			},
			{
				text: "    \u2713 002-fix-ci cloned in 280ms",
				color: "#7ee787",
				delay: 500,
			},
			{ text: "", delay: 300 },
			{
				text: '  \u23FA Bash  exp new "dark-mode" --no-terminal',
				color: "#79c0ff",
				bold: true,
				delay: 400,
			},
			{
				text: "    \u2713 003-dark-mode cloned in 310ms",
				color: "#7ee787",
				delay: 500,
			},
			{ text: "", delay: 400 },
			{
				text: "  Three agents dispatched.",
				dim: true,
				delay: 400,
			},
		],
	},

	// Phase 3 (Act 2) — overlays appear
	{
		act: 2,
		lines: [],
	},

	// Phase 4 (Act 2) — results
	{
		act: 2,
		annotation: "\u2190 three PRs, zero context switches",
		lines: [
			{ text: "" },
			{
				text: "  All three done.",
				color: "#e6edf3",
			},
			{ text: "", delay: 300 },
			{
				text: "    001-upgrade-turbo  \u2192 PR #42",
				color: "#e6edf3",
				delay: 300,
			},
			{
				text: "    002-fix-ci         \u2192 PR #43",
				color: "#e6edf3",
				delay: 250,
			},
			{
				text: "    003-dark-mode      \u2192 PR #44",
				color: "#e6edf3",
				delay: 250,
			},
			{ text: "", delay: 500 },
			{
				text: "  3 branches pushed. 3 PRs created.",
				color: "#7ee787",
				delay: 500,
			},
			{
				text: "  Your auth branch is untouched.",
				dim: true,
				delay: 400,
			},
			{ text: "", delay: 800 },
			{
				text: "  > nice. let\u2019s keep going on auth",
				color: "#e6edf3",
				bold: true,
				delay: 400,
			},
		],
	},
];

// ── Typing Animation ──

function useTypingAnimation(text: string, speed = 50) {
	const [displayed, setDisplayed] = useState("");
	const [done, setDone] = useState(false);

	useEffect(() => {
		if (!text) {
			setDisplayed("");
			setDone(true);
			return;
		}
		setDisplayed("");
		setDone(false);
		let i = 0;
		const interval = setInterval(() => {
			i++;
			setDisplayed(text.slice(0, i));
			if (i >= text.length) {
				clearInterval(interval);
				setDone(true);
			}
		}, speed);
		return () => clearInterval(interval);
	}, [text, speed]);

	return { displayed, done };
}

// ── Static Content ──

function StaticContent({
	act,
	prompt,
	lines,
}: {
	act: 1 | 2;
	prompt?: string;
	lines: Line[];
}) {
	return (
		<>
			{prompt && (
				<div className="flex flex-wrap">
					{act === 1 ? (
						<>
							<span className="text-white/60 mr-1">
								my-app
							</span>
							<span className="text-[#58a6ff]/40 mr-1.5">
								feat/auth-redesign \u276F
							</span>
						</>
					) : (
						<span className="text-white/40 mr-1.5">
							{">"}
						</span>
					)}
					<span className="text-white/90">{prompt}</span>
				</div>
			)}
			{lines.map((line, i) => (
				<div
					key={i}
					style={{
						color: line.dim
							? "rgba(255,255,255,0.35)"
							: line.color ?? "#e6edf3",
						fontWeight: line.bold ? 600 : 400,
					}}
				>
					{line.text || "\u00A0"}
				</div>
			))}
		</>
	);
}

// ── Animated Content ──

function AnimatedContent({
	act,
	prompt,
	lines,
	onContentChange,
	onComplete,
}: {
	act?: 1 | 2;
	prompt?: string;
	lines: Line[];
	onContentChange?: () => void;
	onComplete?: () => void;
}) {
	const { displayed, done: typingDone } = useTypingAnimation(
		prompt ?? "",
		50,
	);
	const [visibleLines, setVisibleLines] = useState(0);

	useEffect(() => {
		setVisibleLines(0);
	}, [prompt, lines]);

	useEffect(() => {
		if (!typingDone) return;
		if (lines.length === 0) {
			onComplete?.();
			return;
		}

		let lineIdx = 0;
		let cancelled = false;
		const showNextLine = () => {
			if (cancelled || lineIdx >= lines.length) {
				if (!cancelled) onComplete?.();
				return;
			}
			const line = lines[lineIdx];
			const delay = line.delay ?? 150;
			lineIdx++;
			setVisibleLines(lineIdx);
			onContentChange?.();
			setTimeout(showNextLine, delay);
		};

		setTimeout(showNextLine, prompt ? 400 : 200);
		return () => {
			cancelled = true;
		};
	}, [typingDone, prompt, lines]);

	useEffect(() => {
		onContentChange?.();
	}, [displayed]);

	return (
		<>
			{prompt && (
				<div className="flex flex-wrap">
					{act === 1 ? (
						<>
							<span className="text-white/60 mr-1">
								my-app
							</span>
							<span className="text-[#58a6ff]/40 mr-1.5">
								feat/auth-redesign \u276F
							</span>
						</>
					) : act === 2 ? (
						<span className="text-white/40 mr-1.5">
							{">"}
						</span>
					) : null}
					<span className="text-white/90">{displayed}</span>
					{!typingDone && (
						<motion.span
							animate={{ opacity: [1, 0] }}
							transition={{
								repeat: Number.POSITIVE_INFINITY,
								duration: 0.6,
							}}
							className="text-white/80 ml-[1px]"
						>
							&#x258b;
						</motion.span>
					)}
				</div>
			)}

			{typingDone &&
				lines.slice(0, visibleLines).map((line, i) => (
					<motion.div
						key={`line-${i}`}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.15 }}
						style={{
							color: line.dim
								? "rgba(255,255,255,0.35)"
								: line.color ?? "#e6edf3",
							fontWeight: line.bold ? 600 : 400,
						}}
					>
						{line.text || "\u00A0"}
					</motion.div>
				))}
		</>
	);
}

// ── Progress Dots ──

function ProgressDots({
	total,
	current,
	onSelect,
}: {
	total: number;
	current: number;
	onSelect: (i: number) => void;
}) {
	return (
		<div className="flex gap-3 items-center">
			{Array.from({ length: total }).map((_, i) => (
				<button
					key={i}
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onSelect(i);
					}}
					className={`rounded-full transition-all duration-300 cursor-pointer border-0 p-0 ${
						i === current
							? "bg-white/80 w-2 h-2 scale-110"
							: i < current
								? "bg-white/30 w-1.5 h-1.5 hover:bg-white/50"
								: "bg-white/10 w-1.5 h-1.5 hover:bg-white/25"
					}`}
				/>
			))}
		</div>
	);
}

// ── Traffic lights (zsh terminal) ──

function TrafficLights() {
	return (
		<div className="flex gap-1.5">
			<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
			<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
			<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
		</div>
	);
}

// ── App ──

const TERMINAL_HEIGHT = 440;

export default function App() {
	const [segmentIndex, setSegmentIndex] = useState(0);
	const [phaseComplete, setPhaseComplete] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const segment = segments[segmentIndex];
	const currentAct = segment.act;

	// Which segments to accumulate (reset between acts)
	const actStartIndex = currentAct === 1 ? 0 : 2;

	// Overlay visibility
	const showAct1Overlay = segmentIndex === 1;
	const showAct2Overlays = segmentIndex === 3;

	useEffect(() => {
		setPhaseComplete(false);
	}, [segmentIndex]);

	// Auto-scroll
	const scrollToBottom = useCallback(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, []);

	useEffect(() => {
		scrollToBottom();
	}, [segmentIndex, scrollToBottom]);

	const goNext = useCallback(() => {
		setSegmentIndex((prev) => Math.min(prev + 1, segments.length - 1));
	}, []);

	const goPrev = useCallback(() => {
		setSegmentIndex((prev) => Math.max(prev - 1, 0));
	}, []);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (
				e.key === " " ||
				e.key === "ArrowRight" ||
				e.key === "Enter"
			) {
				e.preventDefault();
				goNext();
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				goPrev();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [goNext, goPrev]);

	const isLast = segmentIndex >= segments.length - 1;

	return (
		<div
			className="h-screen w-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 p-8 select-none cursor-pointer"
			onClick={goNext}
		>
			{/* Header */}
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				className="text-center"
			>
				<h1 className="text-white/90 text-3xl font-bold tracking-tight">
					<span className="text-[#7ee787]">&gt;</span> exp
				</h1>
				<p className="text-white/30 text-sm mt-1">
					instant experiment forking via APFS clonefile
				</p>
			</motion.div>

			{/* Terminal area */}
			<div
				className="relative"
				style={{ width: 780, height: TERMINAL_HEIGHT + 20 }}
			>
				{/* Main terminal */}
				<motion.div
					className="w-[680px] relative"
					style={{ zIndex: 10 }}
					animate={{
						opacity: 1,
					}}
				>
					<div
						className="rounded-xl overflow-hidden shadow-2xl shadow-black/50 border border-white/[0.08] flex flex-col"
						style={{ height: TERMINAL_HEIGHT }}
					>
						{/* Title bar — switches between acts */}
						<AnimatePresence mode="wait">
							{currentAct === 1 ? (
								<motion.div
									key="zsh-bar"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="px-4 py-2.5 flex items-center gap-3 bg-[#161b22]"
								>
									<TrafficLights />
									<span className="text-[11px] text-white/30 ml-auto">
										my-app &mdash;{" "}
										<span className="text-[#58a6ff]/40">
											feat/auth-redesign
										</span>
									</span>
								</motion.div>
							) : (
								<motion.div
									key="claude-bar"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="px-4 py-2.5 flex items-center gap-2 bg-[#1a1125]"
								>
									<span className="text-[11px] font-medium text-[#d2a8ff]/70">
										&#x2733; Claude Code
									</span>
									<span className="text-[11px] text-white/20 ml-auto">
										opus &middot; my-app
									</span>
								</motion.div>
							)}
						</AnimatePresence>

						{/* Content — resets between acts */}
						<div
							ref={scrollRef}
							className={`p-5 pb-12 font-mono text-[13.5px] leading-[1.65] flex-1 overflow-y-auto hide-scrollbar transition-colors duration-500 ${
								currentAct === 1
									? "bg-[#0d1117]"
									: "bg-[#0f0a18]"
							}`}
						>
							{/* Completed segments in current act */}
							{segments
								.slice(actStartIndex, segmentIndex)
								.map((seg, i) => (
									<div
										key={`completed-${actStartIndex + i}`}
									>
										<StaticContent
											act={seg.act}
											prompt={seg.prompt}
											lines={seg.lines}
										/>
									</div>
								))}

							{/* Active segment */}
							{(segment.prompt ||
								segment.lines.length > 0) && (
								<AnimatedContent
									act={segment.act}
									prompt={segment.prompt}
									lines={segment.lines}
									onContentChange={scrollToBottom}
									onComplete={() =>
										setPhaseComplete(true)
									}
								/>
							)}
						</div>
					</div>
				</motion.div>

				{/* Annotation */}
				<AnimatePresence>
					{phaseComplete && segment.annotation && (
						<motion.div
							key={`annotation-${segmentIndex}`}
							className="absolute whitespace-nowrap"
							style={{ left: 700, top: 260 }}
							initial={{ opacity: 0, x: -6 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0 }}
							transition={{
								duration: 0.5,
								delay: 0.4,
							}}
						>
							<span className="text-white/25 text-[13px] italic">
								{segment.annotation}
							</span>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Act 1 overlay — new terminal in clone */}
				<AnimatePresence>
					{showAct1Overlay && (
						<motion.div
							className="absolute"
							style={{
								top: 36,
								right: 0,
								width: 480,
								zIndex: 20,
							}}
							initial={{ opacity: 0, scale: 0.92, y: 24 }}
							animate={{
								opacity: 1,
								scale: 1,
								y: 0,
							}}
							exit={{
								opacity: 0,
								scale: 0.9,
								transition: { duration: 0.2 },
							}}
							transition={{
								type: "spring",
								bounce: 0.1,
								duration: 0.7,
							}}
						>
							<div className="rounded-xl overflow-hidden shadow-2xl shadow-black/60 border border-white/[0.08]">
								<div className="px-4 py-2.5 flex items-center gap-3 bg-[#161b22]">
									<TrafficLights />
									<span className="text-[11px] text-white/30 ml-auto">
										001-upgrade-turbo &mdash;
										zsh
									</span>
								</div>
								<div className="p-5 font-mono text-[13.5px] leading-[1.65] bg-[#0d1117]">
									<AnimatedContent
										lines={act1OverlayLines}
									/>
									<motion.span
										animate={{
											opacity: [1, 0],
										}}
										transition={{
											repeat: Number.POSITIVE_INFINITY,
											duration: 0.6,
										}}
										className="text-[#58a6ff]/70 ml-1"
									>
										&#x258b;
									</motion.span>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Act 2 overlays — three agents cascading */}
				<AnimatePresence>
					{showAct2Overlays &&
						agentOverlays.map((overlay, i) => (
							<motion.div
								key={`agent-${i}`}
								className="absolute"
								style={{
									left: 580 + i * 30,
									top: 20 + i * 38,
									width: 350,
									zIndex: 18 + i,
								}}
								initial={{
									opacity: 0,
									scale: 0.92,
									y: 24,
								}}
								animate={{
									opacity: 1,
									scale: 1,
									y: 0,
								}}
								exit={{
									opacity: 0,
									scale: 0.9,
									transition: { duration: 0.2 },
								}}
								transition={{
									type: "spring",
									bounce: 0.1,
									duration: 0.7,
									delay: i * 0.5,
								}}
							>
								<div className="rounded-xl overflow-hidden shadow-2xl shadow-black/60 border border-white/[0.08]">
									<div className="px-4 py-2 flex items-center gap-2 bg-[#1a1125]">
										<span className="text-[11px] font-medium text-[#d2a8ff]/70">
											{overlay.title}
										</span>
									</div>
									<div className="p-4 font-mono text-[12.5px] leading-[1.6] bg-[#0f0a18]">
										<AnimatedContent
											lines={overlay.lines}
										/>
									</div>
								</div>
							</motion.div>
						))}
				</AnimatePresence>
			</div>

			{/* Progress */}
			<div className="flex flex-col items-center gap-3">
				<ProgressDots
					total={segments.length}
					current={segmentIndex}
					onSelect={(i) => setSegmentIndex(i)}
				/>
				<p className="text-white/15 text-xs">
					{isLast
						? "brew install digitalpine/tap/exp"
						: "click or press \u2192"}
				</p>
			</div>
		</div>
	);
}
