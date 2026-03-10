"use client";

import { useEffect, useRef } from "react";

export default function ForceDark({ children }: { children: React.ReactNode }) {
  const restored = useRef(false);

  useEffect(() => {
    const html = document.documentElement;
    const hadDark = html.classList.contains("dark");

    // Force dark on mount
    html.classList.add("dark");

    return () => {
      // Restore original theme on unmount
      if (!hadDark && !restored.current) {
        const saved = localStorage.getItem("theme");
        if (saved === "light") {
          html.classList.remove("dark");
        }
        restored.current = true;
      }
    };
  }, []);

  return <>{children}</>;
}