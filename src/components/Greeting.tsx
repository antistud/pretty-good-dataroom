"use client";

import { useEffect, useState } from "react";

/** Greets by the reader's own clock, not the server's. */
export function Greeting({ name }: { name: string }) {
  const [word, setWord] = useState("Hello");
  useEffect(() => {
    const h = new Date().getHours();
    setWord(h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);
  return <>{word}, {name}</>;
}
