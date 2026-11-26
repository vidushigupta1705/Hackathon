import type { ReactNode } from "react";

const LINE = "rgba(235,233,227,0.14)";
const TEXT = "#ebe9e3";
const FAINT = "#7d7b73";
const SIGNAL = "#c8f542";
const DANGER = "#ff7a68";
const OK = "#5ecf92";
const WARN = "#e8a94b";

function Art({ children, tall = false }: { children: ReactNode; tall?: boolean }) {
  return (
    <svg viewBox="0 0 240 88" className={tall ? "h-[112px] w-full" : "h-[88px] w-full"} aria-hidden preserveAspectRatio="xMinYMin meet">
      {children}
    </svg>
  );
}

export function BlastArt() {
  return (
    <Art tall>
      <circle cx="34" cy="44" r="8" fill="none" stroke={SIGNAL} strokeOpacity="0.55" />
      <circle cx="34" cy="44" r="18" fill="none" stroke={SIGNAL} strokeOpacity="0.3" />
      <circle cx="34" cy="44" r="30" fill="none" stroke={SIGNAL} strokeOpacity="0.15" />
      <circle cx="34" cy="44" r="3" fill={SIGNAL} />
      <path d="M64 44 C96 44 104 16 140 16" fill="none" stroke={DANGER} strokeWidth="1" />
      <path d="M64 44 C96 44 104 44 140 44" fill="none" stroke={DANGER} strokeWidth="1" strokeDasharray="3 2" />
      <path d="M64 44 C96 44 104 72 140 72" fill="none" stroke={WARN} strokeWidth="1" strokeDasharray="3 2" />
      <rect x="140" y="6" width="78" height="20" rx="2" fill="#101010" stroke={LINE} />
      <text x="148" y="19" className="font-mono" fontSize="7.5" fill={DANGER}>
        breaking
      </text>
      <rect x="140" y="34" width="78" height="20" rx="2" fill="#101010" stroke={LINE} />
      <text x="148" y="47" className="font-mono" fontSize="7.5" fill={DANGER}>
        breaking
      </text>
      <rect x="140" y="62" width="78" height="20" rx="2" fill="#101010" stroke={LINE} />
      <text x="148" y="75" className="font-mono" fontSize="7.5" fill={WARN}>
        potential
      </text>
    </Art>
  );
}

export function GraphArt() {
  return (
    <Art>
      <path d="M40 24 L100 44 M40 24 L40 64 M40 64 L100 44 M100 44 L190 24 M100 44 L190 64" fill="none" stroke={LINE} strokeWidth="1" />
      <circle cx="40" cy="24" r="4" fill="#101010" stroke={SIGNAL} strokeWidth="1.2" />
      <circle cx="40" cy="64" r="4" fill="#101010" stroke={TEXT} strokeWidth="1" />
      <circle cx="100" cy="44" r="5" fill="#101010" stroke={SIGNAL} strokeWidth="1.2" />
      <circle cx="190" cy="24" r="4" fill="#101010" stroke={WARN} strokeWidth="1" />
      <circle cx="190" cy="64" r="4" fill="#101010" stroke={TEXT} strokeWidth="1" />
      <text x="112" y="82" className="font-mono" fontSize="7" letterSpacing="0.8" fill={FAINT}>
        3 LEVELS
      </text>
    </Art>
  );
}

export function SimArt() {
  return (
    <Art>
      <rect x="10" y="30" width="76" height="30" rx="2" fill="#101010" stroke={LINE} />
      <text x="18" y="49" className="font-mono" fontSize="8" fill={TEXT}>
        getUser()
      </text>
      <path d="M96 45 H140" fill="none" stroke={SIGNAL} strokeWidth="1" strokeDasharray="3 3" />
      <path d="M134 41 L140 45 L134 49" fill="none" stroke={SIGNAL} strokeWidth="1" />
      <rect x="148" y="30" width="82" height="30" rx="2" fill="#101010" stroke="rgba(255,122,104,0.35)" strokeDasharray="3 2" />
      <text x="158" y="49" className="font-mono" fontSize="8" fill={DANGER}>
        removed
      </text>
      <text x="10" y="20" className="font-mono" fontSize="7" letterSpacing="0.8" fill={FAINT}>
        HYPOTHESIS
      </text>
      <text x="10" y="78" className="font-mono" fontSize="7" letterSpacing="0.8" fill={FAINT}>
        3 REPOS AFFECTED
      </text>
    </Art>
  );
}

export function FixArt() {
  return (
    <Art>
      <rect x="10" y="14" width="220" height="16" fill="rgba(255,122,104,0.06)" />
      <text x="16" y="26" className="font-mono" fontSize="8" fill={DANGER}>
        − getUser(Number(req.params.id))
      </text>
      <rect x="10" y="34" width="220" height="16" fill="rgba(94,207,146,0.06)" />
      <text x="16" y="46" className="font-mono" fontSize="8" fill={OK}>
        + getUser(req.params.id)
      </text>
      <rect x="10" y="58" width="86" height="18" rx="2" fill="none" stroke={OK} strokeOpacity="0.4" />
      <text x="18" y="70" className="font-mono" fontSize="7" letterSpacing="0.8" fill={OK}>
        APPROVED
      </text>
      <text x="106" y="70" className="font-mono" fontSize="7" letterSpacing="0.8" fill={FAINT}>
        NOT APPLIED YET
      </text>
    </Art>
  );
}

export function HealthArt() {
  const bars = [22, 34, 18, 40, 28, 46, 36, 30, 44, 38, 50, 42];
  return (
    <Art>
      {bars.map((h, i) => (
        <rect
          key={i}
          x={12 + i * 18}
          y={76 - h}
          width="8"
          height={h}
          fill={i > 8 ? SIGNAL : "rgba(235,233,227,0.22)"}
          opacity={i > 8 ? 0.8 : 1}
        />
      ))}
      <path d="M12 54 L30 44 L48 50 L66 34 L84 40 L102 28 L120 34 L138 24 L156 30 L174 18 L192 24 L210 14" fill="none" stroke={LINE} strokeWidth="1" />
      <text x="12" y="86" className="font-mono" fontSize="6.5" letterSpacing="0.8" fill={FAINT}>
        12 WEEKS · GRADE B+
      </text>
    </Art>
  );
}

export function TestArt() {
  return (
    <Art>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="12" y={12 + i * 19} width="10" height="10" fill="none" stroke={i < 2 ? OK : LINE} />
          {i < 2 && <path d={`M14 ${17 + i * 19} l3 3 l5 -6`} fill="none" stroke={OK} strokeWidth="1.2" />}
          <rect x="32" y={16 + i * 19} width={90 + i * 26} height="3" fill="rgba(235,233,227,0.14)" />
        </g>
      ))}
      <text x="184" y="22" className="font-mono" fontSize="7" letterSpacing="0.6" fill={OK}>
        covers
      </text>
      <text x="184" y="60" className="font-mono" fontSize="7" letterSpacing="0.6" fill={WARN}>
        no test
      </text>
    </Art>
  );
}
