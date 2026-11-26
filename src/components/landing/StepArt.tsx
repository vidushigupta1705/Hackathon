import type { ReactNode } from "react";

const LINE = "rgba(235,233,227,0.14)";
const TEXT = "#ebe9e3";
const MUTED = "#9c9a92";
const FAINT = "#7d7b73";
const SIGNAL = "#c8f542";
const DANGER = "#ff7a68";
const OK = "#5ecf92";
const WARN = "#e8a94b";

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 300 132" className="h-[132px] w-full" aria-hidden>
      <rect x="0.5" y="0.5" width="299" height="131" fill="none" stroke="rgba(235,233,227,0.06)" />
      {children}
    </svg>
  );
}

/* 01 — parse imports, manifests and HTTP calls into a graph */
export function MapArt() {
  return (
    <Frame>
      <rect x="10" y="47" width="88" height="38" rx="3" fill="#101010" stroke={LINE} />
      <rect x="10" y="47" width="2" height="38" fill={SIGNAL} />
      <text x="20" y="71" className="font-mono" fontSize="9" fill={TEXT}>
        user-service
      </text>

      <rect x="200" y="10" width="90" height="36" rx="3" fill="#101010" stroke={LINE} />
      <text x="210" y="33" className="font-mono" fontSize="9" fill={TEXT}>
        order-service
      </text>

      <rect x="200" y="86" width="90" height="36" rx="3" fill="#101010" stroke={LINE} />
      <text x="210" y="109" className="font-mono" fontSize="9" fill={TEXT}>
        billing-service
      </text>

      <path d="M98 60 C140 60 158 28 200 28" fill="none" stroke={SIGNAL} strokeWidth="1" strokeOpacity="0.7" />
      <path d="M98 72 C140 72 158 104 200 104" fill="none" stroke={FAINT} strokeWidth="1" strokeDasharray="3 3" />
      <circle cx="98" cy="60" r="2" fill={SIGNAL} />
      <circle cx="200" cy="28" r="2" fill={SIGNAL} />
      <circle cx="200" cy="104" r="2" fill={FAINT} />

      <text x="132" y="34" className="font-mono" fontSize="7.5" letterSpacing="0.6" fill={FAINT}>
        import
      </text>
      <text x="126" y="92" className="font-mono" fontSize="7.5" letterSpacing="0.6" fill={FAINT}>
        http
      </text>
      <text x="10" y="118" className="font-mono" fontSize="7.5" letterSpacing="1.2" fill={FAINT}>
        3 SOURCES · 1 GRAPH
      </text>
    </Frame>
  );
}

/* 02 — classify the change itself */
export function DiffArt() {
  return (
    <Frame>
      <text x="10" y="20" className="font-mono" fontSize="8" letterSpacing="0.8" fill={FAINT}>
        user-service/src/types.ts
      </text>
      <rect x="10" y="28" width="280" height="88" fill="#0a0a09" stroke="rgba(235,233,227,0.08)" />
      <text x="20" y="46" className="font-mono" fontSize="8.5" fill={MUTED}>
        export interface User {"{"}
      </text>
      <rect x="10" y="54" width="280" height="17" fill="rgba(255,122,104,0.07)" />
      <text x="20" y="66" className="font-mono" fontSize="8.5" fill={DANGER}>
        − id: number;
      </text>
      <rect x="10" y="73" width="280" height="17" fill="rgba(94,207,146,0.07)" />
      <text x="20" y="85" className="font-mono" fontSize="8.5" fill={OK}>
        + id: string;
      </text>
      <text x="20" y="104" className="font-mono" fontSize="8.5" fill={MUTED}>
        {"}"}
      </text>
      <rect x="228" y="54" width="62" height="17" fill="none" stroke="rgba(255,122,104,0.3)" strokeDasharray="2 2" />
      <text x="246" y="66" className="font-mono" fontSize="7" letterSpacing="0.6" fill={DANGER}>
        param
      </text>
    </Frame>
  );
}

/* 03 — walk the graph, assign verdicts */
export function TraceArt() {
  return (
    <Frame>
      <circle cx="26" cy="62" r="14" fill="none" stroke={SIGNAL} strokeOpacity="0.25" />
      <circle cx="26" cy="62" r="5" fill={SIGNAL} />
      <text x="14" y="94" className="font-mono" fontSize="7.5" letterSpacing="1" fill={FAINT}>
        CHANGE
      </text>

      <path d="M44 62 H92" fill="none" stroke={DANGER} strokeWidth="1.1" strokeDasharray="3 3" />
      <rect x="92" y="42" width="80" height="40" rx="3" fill="#101010" stroke={LINE} />
      <rect x="92" y="42" width="2" height="40" fill={DANGER} />
      <text x="102" y="60" className="font-mono" fontSize="8.5" fill={TEXT}>
        order-service
      </text>
      <text x="102" y="74" className="font-mono" fontSize="7" letterSpacing="0.8" fill={DANGER}>
        BREAKING
      </text>

      <path d="M172 62 H204" fill="none" stroke={WARN} strokeWidth="1.1" strokeDasharray="3 3" />
      <rect x="204" y="42" width="84" height="40" rx="3" fill="#101010" stroke={LINE} />
      <rect x="204" y="42" width="2" height="40" fill={WARN} />
      <text x="214" y="60" className="font-mono" fontSize="8.5" fill={TEXT}>
        web-gateway
      </text>
      <text x="214" y="74" className="font-mono" fontSize="7" letterSpacing="0.8" fill={WARN}>
        POTENTIAL
      </text>

      <text x="92" y="26" className="font-mono" fontSize="7.5" letterSpacing="0.8" fill={FAINT}>
        hop 1
      </text>
      <text x="204" y="26" className="font-mono" fontSize="7.5" letterSpacing="0.8" fill={FAINT}>
        hop 2
      </text>
      <text x="14" y="118" className="font-mono" fontSize="7.5" letterSpacing="1.2" fill={FAINT}>
        VERDICT · CONFIDENCE · REASON
      </text>
    </Frame>
  );
}
