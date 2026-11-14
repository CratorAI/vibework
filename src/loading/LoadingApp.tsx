import { useState, useEffect } from "react";

const TITLES = [
  "Setting up workspace",
  "Connecting your tools",
  "Loading your preferences",
  "Almost ready",
];

export default function LoadingApp() {
  const [titleIndex, setTitleIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (titleIndex >= TITLES.length - 1) return;
      setAnimating(true);
      setTimeout(() => {
        setTitleIndex((prev) =>
          prev < TITLES.length - 1 ? prev + 1 : prev
        );
        setAnimating(false);
      }, 300);
    }, 3500);
    return () => clearInterval(interval);
  }, [titleIndex]);

  return (
    <div
      data-tauri-drag-region
      className="h-full w-full flex items-center justify-center p-4 rounded-2xl overflow-hidden cursor-default text-foreground"
      style={{
        background:
          "radial-gradient(circle at center, var(--background) 0%, var(--secondary) 100%)",
      }}
    >
      <div className="text-center max-w-md w-full">
        <div className="flex justify-center">
          <div className="flex items-center justify-center">
            <img src="/logo-small.png" alt="Vibework" width={48} height={48} className="wordmark" />
          </div>
        </div>
        <div className="my-[24px]">
          <div className="h-[40px] overflow-hidden relative">
            <h2
              className={`text-2xl text-foreground transition-[transform,opacity] duration-200 ease-out ${
                animating
                  ? "-translate-y-full opacity-0"
                  : "translate-y-0 opacity-100"
              }`}
            >
              {TITLES[titleIndex]}
            </h2>
          </div>
          <p className="text-ui text-muted-foreground">
            Hang tight, this won't take long
          </p>
        </div>
        <div className="flex justify-center">
          <span className="loader-big"></span>
        </div>
      </div>
    </div>
  );
}
