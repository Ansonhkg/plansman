import {Chip, Tooltip} from "@heroui/react";

import {formatCompletion, STATE_MAP, type PlanStatus} from "../data/tracker";

interface GlyphProps {
  size?: number;
  className?: string;
}

export function StatusIcon({state, size = 16, className}: {state: PlanStatus} & GlyphProps) {
  const color = STATE_MAP[state].color;
  const common = {
    className,
    fill: "none",
    height: size,
    viewBox: "0 0 16 16",
    width: size,
    xmlns: "http://www.w3.org/2000/svg",
  };

  if (state === "running") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.6" />
        <circle
          cx="8"
          cy="8"
          fill="none"
          r="3"
          stroke={color}
          strokeDasharray="9.42 18.85"
          strokeWidth="6"
          transform="rotate(-90 8 8)"
        />
      </svg>
    );
  }

  if (state === "done") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" fill={color} r="7" />
        <path
          d="M5 8.2 7 10.2 11 5.8"
          fill="none"
          stroke="var(--accent-foreground)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export function CompletionPill({
  completion,
  className,
}: {
  completion: number;
  className?: string;
}) {
  return (
    <Tooltip delay={250}>
      <Chip className={`chip-tiny min-w-14 justify-center ${className ?? ""}`} size="sm" variant="secondary">
        <span className="text-foreground/75 tabular-nums">{formatCompletion(completion)}</span>
      </Chip>
      <Tooltip.Content>
        <p className="text-xs">Completion {formatCompletion(completion)}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function CompletionBar({completion}: {completion: number}) {
  return (
    <div className="bg-default h-1.5 w-20 overflow-hidden rounded-full">
      <div
        className="bg-accent h-full rounded-full"
        style={{width: `${Math.max(0, Math.min(100, completion))}%`}}
      />
    </div>
  );
}
