import { useEffect, useRef } from "react";

export default function CyberGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const columns = Math.floor(width / 20) + 1;
    const ypos = Array(columns).fill(0);

    // Render loop
    const draw = () => {
      // Semi-transparent black background to create trailing effect
      ctx.fillStyle = "rgba(3, 0, 30, 0.08)";
      ctx.fillRect(0, 0, width, height);

      // Neon grid lines overlay
      ctx.strokeStyle = "rgba(0, 240, 255, 0.03)";
      ctx.lineWidth = 1;
      
      // Draw grid lines
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Matrix rain characters
      ctx.fillStyle = "rgba(0, 240, 255, 0.35)"; // Cyan text
      ctx.font = "14px monospace";

      ypos.forEach((y, ind) => {
        // Random binary or hex digit
        const text = Math.random() > 0.5 ? "0" : "1";
        const x = ind * 20;
        ctx.fillText(text, x, y);

        // Highlighting some drops in pink
        if (Math.random() > 0.98) {
          ctx.fillStyle = "#ff007f"; // pink highlight
          ctx.fillText(text, x, y);
          ctx.fillStyle = "rgba(0, 240, 255, 0.35)";
        }

        if (y > 100 + Math.random() * 10000) {
          ypos[ind] = 0;
        } else {
          ypos[ind] = y + 15;
        }
      });

      // Scanlines effect
      ctx.fillStyle = "rgba(255, 0, 127, 0.015)";
      for (let y = 0; y < height; y += 4) {
        ctx.fillRect(0, y, width, 2);
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-50 bg-[#03001e]" />;
}
