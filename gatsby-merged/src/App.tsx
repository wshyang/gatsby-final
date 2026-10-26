import { useCallback, useEffect, useRef, useState } from "react";
import { GatsbyScene, buildPhases, type Phase, type SceneStats } from "./scenes/GatsbyScene";
import { TypewriterShowcase } from "./scenes/TypewriterShowcase";
import { GATSBY_TIMELINE, scaleTimeline } from "./engine/Timeline";
import { cn } from "./utils/cn";

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const num = (n: number) => n.toLocaleString("en-US");

/** URL parameters: ?scene=typewriter&text=Hello  ?t=12.5  ?pace=1.5  ?ui=0 */
const params = new URLSearchParams(window.location.search);
const SHOWCASE = params.get("scene") === "typewriter";
const PACE = Math.min(4, Math.max(0.25, Number(params.get("pace")) || 1));
const START_T = Number(params.get("t")) || 0;
const TIMELINE = PACE === 1 ? GATSBY_TIMELINE : scaleTimeline(GATSBY_TIMELINE, PACE);
const FALLBACK_PHASES: Phase[] = buildPhases(TIMELINE, TIMELINE.holdFrameAt + 2);

function phaseAt(phases: Phase[], t: number): Phase {
  let p = phases[0];
  for (const ph of phases) if (t >= ph.from) p = ph;
  return p;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GatsbyScene | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showMapping, setShowMapping] = useState(false);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uiHidden, setUiHidden] = useState(params.get("ui") === "0");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (SHOWCASE) {
      const showcase = new TypewriterShowcase(canvas, { text: params.get("text") ?? undefined });
      (window as unknown as { __showcase?: TypewriterShowcase }).__showcase = showcase;
      showcase
        .init()
        .then(() => {
          if (START_T > 0) showcase.setTime(START_T);
          const bad = showcase.unsupported;
          setStats({
            sources: 0,
            members: 0,
            chaff: 0,
            identityMapped: 0,
            searchMapped: 0,
            fallbackClones: 0,
            slots: 0,
            pages: 1,
            fontUsed: "",
            warnings: bad.length ? [`the keyboard cannot type: ${bad.join(" ")}`] : [],
          });
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      const onResize = () => showcase.resize();
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        showcase.dispose();
      };
    }
    let scene: GatsbyScene | null = null;
    try {
      scene = new GatsbyScene(canvas, { onTime: setTime, onReady: setStats }, { pace: PACE });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    sceneRef.current = scene;
    // Debug handle for scripted inspection (e.g. headless screenshots).
    (window as unknown as { __gatsby?: GatsbyScene }).__gatsby = scene;
    scene
      .init()
      .then(() => {
        if (START_T > 0) {
          scene?.setTime(START_T);
          if (params.get("hold") === "1" && scene) scene.playing = false;
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const onResize = () => scene?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      const next = !p;
      if (sceneRef.current) sceneRef.current.playing = next;
      return next;
    });
  }, []);

  const replay = useCallback(() => {
    sceneRef.current?.setTime(0);
    setTime(0);
    if (sceneRef.current) sceneRef.current.playing = true;
    setPlaying(true);
  }, []);

  const scrub = useCallback((t: number) => {
    sceneRef.current?.setTime(t);
    setTime(t);
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeed((s) => {
      const next = s === 1 ? 0.25 : s === 0.25 ? 0.5 : 1;
      if (sceneRef.current) sceneRef.current.speed = next;
      return next;
    });
  }, []);

  const toggleMapping = useCallback(() => {
    setShowMapping((m) => {
      sceneRef.current?.setShowMapping(!m);
      return !m;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "r" || e.key === "R") replay();
      else if (e.key === "m" || e.key === "M") toggleMapping();
      else if (e.key === "h" || e.key === "H") setUiHidden((h) => !h);
      else if (e.key === "ArrowRight") scrub(Math.min(TIMELINE.duration, (sceneRef.current?.time ?? 0) + 1));
      else if (e.key === "ArrowLeft") scrub(Math.max(0, (sceneRef.current?.time ?? 0) - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, replay, toggleMapping, scrub]);

  const phase = phaseAt(sceneRef.current?.phases.length ? sceneRef.current.phases : FALLBACK_PHASES, time);
  const progress = (time / TIMELINE.duration) * 100;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black font-serif text-[#f1e6cf] select-none">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* Loading / error */}
      {!stats && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
          <Monogram />
          <p className="text-xs tracking-[0.45em] uppercase text-[#d9b45b]/80">Setting the type…</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black p-8 text-center">
          <div>
            <p className="text-sm tracking-[0.3em] uppercase text-[#d9b45b]">WebGL could not start</p>
            <p className="mt-3 max-w-md text-sm text-[#f1e6cf]/70">{error}</p>
          </div>
        </div>
      )}

      {/* Overlay UI */}
      <div className={cn("pointer-events-none absolute inset-0 transition-opacity duration-700", uiHidden && "opacity-0")}>
        {/* Title */}
        <header className="absolute top-6 left-7 md:top-9 md:left-12">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-[#d9b45b]/70" />
            <span className="text-[10px] tracking-[0.5em] uppercase text-[#d9b45b]">The Great Gatsby · 2013 · 01:06–01:28</span>
          </div>
          <h1 className="mt-2 text-2xl leading-tight font-light tracking-wide md:text-3xl">
            Typographic <span className="italic text-[#d9b45b]">Lift-off</span>
          </h1>
          <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-[#f1e6cf]/55 md:text-xs">
            WebGL study — every character is an instanced quad pinned to a coordinate on a paper mesh before it flies.
          </p>
        </header>

        {/* Phase */}
        <aside className="absolute top-6 right-7 max-w-[240px] text-right md:top-9 md:right-12">
          <p className="text-[10px] tracking-[0.5em] uppercase text-[#d9b45b]">Phase</p>
          <p className="mt-1 text-lg md:text-xl">{phase.name}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#f1e6cf]/55">{phase.blurb}</p>
        </aside>

        {/* Controls */}
        <footer className="pointer-events-auto absolute right-0 bottom-0 left-0 px-7 pb-6 md:px-12 md:pb-8">
          <div className="mx-auto max-w-5xl">
            {/* Timeline */}
            <div className="relative h-6">
              <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-[#f1e6cf]/15" />
              <div className="absolute top-1/2 left-0 h-px -translate-y-1/2 bg-[#d9b45b]" style={{ width: `${progress}%` }} />
              {/* Phase ticks */}
              {[TIMELINE.memberLiftStart, TIMELINE.deskFade[0], TIMELINE.holdFrameAt - 3.5, TIMELINE.dissolve[0]].map((t) => (
                <span key={t} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-[#d9b45b]/60" style={{ left: `${(t / TIMELINE.duration) * 100}%` }} />
              ))}
              <input
                type="range"
                min={0}
                max={TIMELINE.duration}
                step={0.01}
                value={time}
                onChange={(e) => scrub(parseFloat(e.target.value))}
                aria-label="Timeline"
                className="absolute inset-0 h-6 w-full cursor-pointer appearance-none bg-transparent opacity-0"
              />
              <div className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-[#d9b45b] bg-black" style={{ left: `${progress}%` }} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 text-[11px] tracking-[0.2em] uppercase">
              <button onClick={togglePlay} className="deco-btn">
                {playing ? "Pause" : "Play"}
              </button>
              <button onClick={replay} className="deco-btn">
                Replay
              </button>
              <button onClick={cycleSpeed} className="deco-btn">
                Speed {speed}×
              </button>
              <button onClick={toggleMapping} className={cn("deco-btn", showMapping && "text-[#d9b45b] border-[#d9b45b]")}>
                {showMapping ? "Hide" : "Show"} mapping
              </button>
              <span className="tabular-nums text-[#f1e6cf]/60">
                {fmt(time)} / {fmt(TIMELINE.duration)}
              </span>
              <span className="ml-auto hidden text-[#f1e6cf]/35 normal-case tracking-normal md:inline">
                space · play / pause &nbsp; r · replay &nbsp; m · mapping &nbsp; ←/→ · seek &nbsp; h · hide ui
              </span>
            </div>

            {stats && (
              <p className="mt-3 text-[11px] leading-relaxed text-[#f1e6cf]/45">
                <span className="text-[#d9b45b]/80">Mapping</span> · {num(stats.sources)} glyphs laid out on {stats.pages} paper surfaces →{" "}
                {num(stats.slots)} quote slots ({num(stats.identityMapped)} 1:1 from the typed line, {num(stats.searchMapped)} harvested by nearest same-character search
                {stats.fallbackClones ? `, ${stats.fallbackClones} fallback` : ""}) · all {num(stats.chaff + stats.members)} glyphs take flight, {num(stats.chaff)} into the drifting sea · typeface:{" "}
                {stats.fontUsed}
              </p>
            )}
            {stats && stats.warnings.length > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-[#e0a050]/80">{stats.warnings.join(" · ")}</p>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function Monogram() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="text-[#d9b45b]">
      <circle cx="36" cy="36" r="33" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <circle cx="36" cy="36" r="28" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
      <path d="M26 24h20M26 48h20M36 24v24" stroke="currentColor" strokeWidth="1.2" />
      <path d="M30 30l6 6-6 6M42 30l-6 6 6 6" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
    </svg>
  );
}
