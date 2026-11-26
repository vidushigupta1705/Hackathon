import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function svgProps({ size = 18, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

export function IconOverview(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="2.75" y="2.75" width="6" height="6" rx="1" />
      <rect x="11.25" y="2.75" width="6" height="6" rx="1" />
      <rect x="2.75" y="11.25" width="6" height="6" rx="1" />
      <path d="M11.25 14.25h6M14.25 11.25v6" />
    </svg>
  );
}

export function IconRepo(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M3.25 5.5 10 2.5l6.75 3-6.75 3-6.75-3Z" />
      <path d="m3.25 10 6.75 3 6.75-3" />
      <path d="m3.25 14.5 6.75 3 6.75-3" />
    </svg>
  );
}

export function IconGraph(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="4.5" cy="10" r="2" />
      <circle cx="15.5" cy="4.75" r="2" />
      <circle cx="15.5" cy="15.25" r="2" />
      <path d="m6.3 9.1 7.3-3.5M6.3 10.9l7.3 3.5" />
    </svg>
  );
}

export function IconPullRequest(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="5" cy="4.5" r="1.75" />
      <circle cx="5" cy="15.5" r="1.75" />
      <circle cx="15" cy="15.5" r="1.75" />
      <path d="M5 6.25v7.5M15 13.75V9a3 3 0 0 0-3-3H8.5" />
      <path d="m10 3.75-2 2 2 2" />
    </svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M10 3.2 17.4 16H2.6L10 3.2Z" />
      <path d="M10 8v3.4" />
      <path d="M10 13.9h.01" />
    </svg>
  );
}

export function IconAnalytics(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M3 16.5h14" />
      <path d="M5.5 16.5v-4M9.5 16.5V8M13.5 16.5v-6M17.5 16.5V5" />
    </svg>
  );
}

export function IconCompass(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="m7.4 12.6 1.7-4.5 4.5-1.7-1.7 4.5-4.5 1.7Z" />
    </svg>
  );
}

export function IconFlask(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M8 2.75h4M8.75 2.75v5L4.4 15.2a1.4 1.4 0 0 0 1.2 2.05h8.8a1.4 1.4 0 0 0 1.2-2.05l-4.35-7.45v-5" />
      <path d="M6.4 12.5h7.2" />
    </svg>
  );
}

export function IconQuarantine(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M2.75 3.75h14.5l-5.1 6.4v5.4l-4.3 1.9v-7.3L2.75 3.75Z" />
      <path d="M10.35 12.1h.01" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M3 6h6M13 6h4M3 14h4M11 14h6" />
      <circle cx="11" cy="6" r="2" />
      <circle cx="9" cy="14" r="2" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M3 6h14M3 10h14M3 14h14" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />
    </svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M8.5 4.5H4.5v11h11v-4" />
      <path d="M11.5 3.5H16.5V8.5M16 4 9.5 10.5" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

export function IconBranch(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="6" cy="4.5" r="1.6" />
      <circle cx="6" cy="15.5" r="1.6" />
      <circle cx="14" cy="7.5" r="1.6" />
      <path d="M6 6.1v7.8M14 9.1c0 3.2-3.2 3.6-5.6 4.6" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M10 2.75 16 5v5c0 3.4-2.4 6-6 7.25C6.4 16 4 13.4 4 10V5l6-2.25Z" />
      <path d="m7.5 9.75 1.8 1.8 3.4-3.6" />
    </svg>
  );
}
