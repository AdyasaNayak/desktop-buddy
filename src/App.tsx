import { useEffect, useRef, useState } from "react";
import idleSheet from "./assets/cat.png";
import heartSheet from "./assets/catheart.png";
import drinkSheet from "./assets/catdrink.png";
import workSheet from "./assets/catwork.png";

type PetState = "idle" | "heart" | "drink" | "work";

const SIZE = 160; // draw size - bigger = larger cat

const FRAME_COUNT: Record<PetState, number> = {
  idle: 3,
  heart: 2,
  drink: 2,
  work: 3,
};
const FRAME_MS: Record<PetState, number> = {
  idle: 500,
  heart: 400,
  drink: 600,
  work: 300,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlRef = useRef({ drinkLeft: 0, work: false });
  const [workOn, setWorkOn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const images: Record<PetState, HTMLImageElement> = {
      idle: new Image(),
      heart: new Image(),
      drink: new Image(),
      work: new Image(),
    };
    images.idle.src = idleSheet;
    images.heart.src = heartSheet;
    images.drink.src = drinkSheet;
    images.work.src = workSheet;

    let groundY = window.innerHeight - SIZE - 10;
    let x = window.innerWidth / 2 - SIZE / 2;
    let y = groundY;
    let targetX = x;
    let isWalking = false;
    let stateTimer = 0;
    let frame = 0;
    let lastAnimTime = 0;
    let prevTime = 0;
    let raf = 0;
    let isHovering = false;
    let lastState: PetState = "idle";

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      groundY = canvas.height - SIZE - 10;
      y = Math.min(y, groundY);
    };
    resize();
    window.addEventListener("resize", resize);

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      isHovering = mx >= x && mx <= x + SIZE && my >= y && my <= y + SIZE;
      canvas.style.cursor = isHovering ? "pointer" : "default";
    });
    canvas.addEventListener("mouseleave", () => {
      isHovering = false;
      canvas.style.cursor = "default";
    });
    canvas.addEventListener("dblclick", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (mx >= x && mx <= x + SIZE && my >= y && my <= y + SIZE) {
        console.log("petted 💜");
        y = groundY - 20;
        setTimeout(() => (y = groundY), 150);
      }
    });

    const shownState = (): PetState => {
      if (controlRef.current.drinkLeft > 0) return "drink";
      if (controlRef.current.work) return "work";
      if (isHovering) return "heart";
      return "idle";
    };

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      const dt = prevTime ? Math.min(time - prevTime, 100) : 16;
      prevTime = time;

      const state = shownState();

      if (state !== lastState) {
        frame = 0;
        lastState = state;
      }
      if (time - lastAnimTime > FRAME_MS[state]) {
        frame = (frame + 1) % FRAME_COUNT[state];
        lastAnimTime = time;
      }

      if (controlRef.current.drinkLeft > 0) {
        controlRef.current.drinkLeft -= dt;
        if (controlRef.current.drinkLeft <= 0) controlRef.current.drinkLeft = 0;
      }

      stateTimer += dt;
      if (state === "idle" && !isHovering) {
        if (isWalking) {
          const dir = targetX > x ? 1 : -1;
          x += dir * 0.4;
          if (Math.abs(x - targetX) < 2 || stateTimer > 4000) {
            isWalking = false;
            stateTimer = 0;
          }
          x = Math.max(0, Math.min(x, canvas.width - SIZE));
        } else {
          if (stateTimer > 5000 + Math.random() * 4000) {
            isWalking = true;
            stateTimer = 0;
            targetX = Math.random() * (canvas.width - SIZE - 20) + 10;
            if (Math.abs(targetX - x) < 80) {
              isWalking = false;
              stateTimer = 0;
            }
          }
        }
      }

      // safety clamp: never let cat go below screen
      y = Math.max(0, Math.min(y, groundY));

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = images[state];
      if (img.complete) {
        ctx.drawImage(img, frame * 64, 0, 64, 64, x, y, SIZE, SIZE);
      }
    };

    images.idle.onload = () => {
      raf = requestAnimationFrame(loop);
    };

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          gap: 8,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => {
            controlRef.current.drinkLeft = 2000;
            console.log("water intake +1");
          }}
        >
          💧 Drink water
        </button>
        <button
          onClick={() => {
            controlRef.current.work = !controlRef.current.work;
            setWorkOn((prev) => !prev);
          }}
        >
          {workOn ? "💻 Stop work mode" : "💻 Work mode"}
        </button>
      </div>
    </div>
  );
}
