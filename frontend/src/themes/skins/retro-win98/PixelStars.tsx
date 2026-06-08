import { useEffect, useRef } from "react";

export default function PixelStars() {
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

    // Star data
    const maxStars = 150;
    const stars: Array<{ x: number; y: number; z: number; color: string }> = [];

    for (let i = 0; i < maxStars; i++) {
      stars.push({
        x: Math.random() * width - width / 2,
        y: Math.random() * height - height / 2,
        z: Math.random() * width,
        color: Math.random() > 0.8 ? "#000080" : "#ffffff", // Navy or White
      });
    }

    const draw = () => {
      // Classic Win98 blue screen color or gray background?
      // Let's use solid black for the Starfield screensaver feel!
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#ffffff";
      
      stars.forEach((star) => {
        star.z -= 2; // Move star closer
        if (star.z <= 0) {
          star.z = width;
          star.x = Math.random() * width - width / 2;
          star.y = Math.random() * height - height / 2;
        }

        // Project 3D coordinates onto 2D screen
        const k = 128.0 / star.z;
        const px = star.x * k + width / 2;
        const py = star.y * k + height / 2;

        if (px >= 0 && px < width && py >= 0 && py < height) {
          // Draw pixelated star (varying sizes)
          const size = Math.max(1, Math.floor((1 - star.z / width) * 4));
          
          ctx.fillStyle = star.color;
          ctx.fillRect(Math.floor(px), Math.floor(py), size, size);
        }
      });

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-50 bg-[#000000]" />;
}
