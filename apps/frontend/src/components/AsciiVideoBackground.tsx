import { useEffect, useRef } from "react";

const CHARS = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
const CELL = 6;
const FONT_SIZE = 6;
const GRID_REFRESH_INTERVAL = 80;

// Mouse: tiny 10px cursor glow only — no scatter, no char changes
const GLOW_RADIUS = 10;
const GLOW_RADIUS_SQ = GLOW_RADIUS * GLOW_RADIUS;

// Crossfade config
const CROSSFADE_START = 2.5;
const CROSSFADE_DURATION = 2.0;

interface Props {
  src: string;
}

export function AsciiVideoBackground({ src }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vidARef = useRef<HTMLVideoElement>(null);
  const vidBRef = useRef<HTMLVideoElement>(null);
  const mouseRef = useRef({ x: -999, y: -999 });
  const gridRef = useRef<string[][]>([]);
  const lastGridTimeRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const vidA = vidARef.current!;
    const vidB = vidBRef.current!;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function buildGrid(cols: number, rows: number) {
      const grid: string[][] = [];
      for (let r = 0; r < rows; r++) {
        grid[r] = [];
        for (let c = 0; c < cols; c++) {
          grid[r][c] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }
      gridRef.current = grid;
    }

    // Seamless loop: when vidA is near its end, fade vidB in from the start,
    // then flip which one is "primary"
    let primary = vidA;
    let secondary = vidB;

    function manageCrossfade() {
      if (!primary.duration || isNaN(primary.duration)) return;
      const remaining = primary.duration - primary.currentTime;

      if (remaining <= CROSSFADE_START) {
        // Start secondary from beginning if it hasn't been primed yet
        if (secondary.paused) {
          secondary.currentTime = 0;
          secondary.play().catch(() => {});
        }

        const progress = Math.max(0, Math.min(1, 1 - (remaining / CROSSFADE_DURATION)));
        secondary.style.opacity = String(progress);
        primary.style.opacity = String(1 - progress);

        // Once fully faded to secondary, swap roles
        if (progress >= 1) {
          primary.pause();
          primary.currentTime = 0;
          primary.style.opacity = "0";
          [primary, secondary] = [secondary, primary];
        }
      } else {
        // Ensure secondary is hidden while not in use
        secondary.style.opacity = "0";
        if (!secondary.paused) secondary.pause();
      }
    }

    function draw(ts: number) {
      rafRef.current = requestAnimationFrame(draw);

      manageCrossfade();

      const W = canvas.width;
      const H = canvas.height;
      const cols = Math.floor(W / CELL);
      const rows = Math.floor(H / CELL);
      const grid = gridRef.current;

      if (!grid.length || grid[0].length !== cols || grid.length !== rows) {
        buildGrid(cols, rows);
        return;
      }

      // Refresh a small % of chars each tick for ambient shimmer
      if (ts - lastGridTimeRef.current > GRID_REFRESH_INTERVAL) {
        const count = Math.floor(cols * rows * 0.05);
        for (let i = 0; i < count; i++) {
          const r = Math.floor(Math.random() * rows);
          const c = Math.floor(Math.random() * cols);
          grid[r][c] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        lastGridTimeRef.current = ts;
      }

      ctx.clearRect(0, 0, W, H);
      ctx.font = `${FONT_SIZE}px "Courier New", monospace`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      const pulse = 0.03 + Math.sin(ts * 0.0006) * 0.02;

      const { x: mx, y: my } = mouseRef.current;

      for (let row = 0; row < rows; row++) {
        const cy = row * CELL + CELL / 2;
        const dy = cy - my;
        const dy2 = dy * dy;

        for (let col = 0; col < cols; col++) {
          const cx = col * CELL + CELL / 2;
          const dx = cx - mx;
          const distSq = dx * dx + dy2;

          let opacity = pulse;
          if (distSq < GLOW_RADIUS_SQ) {
            const t = 1 - distSq / GLOW_RADIUS_SQ;
            opacity = Math.min(1, pulse + t * 0.6);
          }

          ctx.fillStyle = `rgba(220, 230, 255, ${opacity})`;
          ctx.fillText(grid[row][col], col * CELL, row * CELL);
        }
      }
    }

    rafRef.current = requestAnimationFrame(draw);

    function onMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener("mousemove", onMouseMove);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  const videoStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    filter: "blur(1.5px) brightness(0.8)",
    transition: `opacity ${CROSSFADE_DURATION}s linear`,
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* Primary video */}
      <video
        ref={vidARef}
        src={src}
        style={{ ...videoStyle, opacity: 1 }}
        autoPlay
        muted
        playsInline
        aria-hidden="true"
      />
      {/* Secondary video — fades in for seamless loop */}
      <video
        ref={vidBRef}
        src={src}
        style={{ ...videoStyle, opacity: 0 }}
        muted
        playsInline
        aria-hidden="true"
      />
      {/* ASCII shimmer overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 2 }}
        aria-hidden="true"
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 3,
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.95) 100%)",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
