import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/board/powerwyze");
  }, [setLocation]);
  return null;
}
