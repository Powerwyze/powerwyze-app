export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="PowerWyze"
    >
      <rect x="2" y="2" width="28" height="28" rx="7" fill="hsl(var(--pw-navy))" />
      <path
        d="M9 22 L9 10 L14.5 10 C17 10 18.5 11.5 18.5 13.8 C18.5 16.1 17 17.6 14.5 17.6 L12 17.6 L12 22 Z"
        fill="hsl(var(--pw-cyan))"
      />
      <circle cx="22.5" cy="11" r="2.2" fill="hsl(var(--pw-cyan))" />
    </svg>
  );
}
