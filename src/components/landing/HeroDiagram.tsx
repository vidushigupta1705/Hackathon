const DANGER = "#ff7a68";
const WARN = "#e8a94b";
const OK = "#5ecf92";
const SIGNAL = "#c8f542";
const TEXT = "#ebe9e3";
const MUTED = "#9c9a92";
const FAINT = "#7d7b73";
const EDGE = "rgba(235,233,227,0.12)";

const NODE = { fill: "#101010", stroke: EDGE };

export default function HeroDiagram() {
  return (
    <figure className="overflow-hidden rounded-[6px] border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5 font-mono text-[10.5px] text-muted">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
          <span className="truncate">PR #41 · acme-commerce/user-service</span>
          <span className="hidden text-faint sm:inline">— Migrate user IDs from integers to UUID strings</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10.5px]">
          <span className="uppercase tracking-[0.1em] text-faint">risk</span>
          <span className="text-danger">78</span>
          <span className="uppercase tracking-[0.1em] text-faint">high</span>
        </div>
      </div>

      <div className="overflow-x-auto bg-panel">
        <svg
          viewBox="0 0 1020 400"
          role="img"
          aria-label="Blast radius diagram: a change in user-service breaks order-service and billing-service, puts web-gateway at risk, and leaves the updated test suite non-breaking."
          className="h-auto w-full min-w-[660px]"
        >
          <defs>
            <marker id="hero-arrow-danger" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill={DANGER} />
            </marker>
            <marker id="hero-arrow-warn" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill={WARN} />
            </marker>
            <marker id="hero-arrow-ok" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill={OK} />
            </marker>
          </defs>

          {/* column annotations */}
          <text x="24" y="138" className="font-mono" fontSize="9" letterSpacing="1.4" fill={FAINT}>
            CHANGED
          </text>
          <text x="700" y="18" className="font-mono" fontSize="9" letterSpacing="1.4" fill={FAINT}>
            DEPENDENTS · HOP 1–2
          </text>

          {/* pulse rings around the origin */}
          {[0, 1.5, 3].map((delay, i) => (
            <circle
              key={i}
              cx="220"
              cy="196"
              r="44"
              fill="none"
              stroke={SIGNAL}
              strokeWidth="1"
              className="pulse-ring"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}

          {/* edges */}
          <path
            d="M 220 176 C 470 176 500 68 700 68"
            fill="none"
            stroke={DANGER}
            strokeWidth="1.2"
            markerEnd="url(#hero-arrow-danger)"
            className="edge-flow"
          />
          <path
            d="M 220 196 C 470 196 520 162 700 162"
            fill="none"
            stroke={DANGER}
            strokeWidth="1.2"
            markerEnd="url(#hero-arrow-danger)"
            className="edge-flow"
            style={{ animationDelay: "0.8s" }}
          />
          <path
            d="M 850 102 L 850 228"
            fill="none"
            stroke={WARN}
            strokeWidth="1.2"
            markerEnd="url(#hero-arrow-warn)"
            className="edge-flow"
            style={{ animationDelay: "1.6s" }}
          />
          <text x="860" y="170" className="font-mono" fontSize="8" letterSpacing="0.6" fill={FAINT}>
            via order
          </text>
          <path
            d="M 220 216 C 470 250 500 344 700 344"
            fill="none"
            stroke={OK}
            strokeWidth="1"
            strokeOpacity="0.75"
            markerEnd="url(#hero-arrow-ok)"
          />

          {/* origin node */}
          <g className="fade-in" style={{ animationDelay: "0.15s" }}>
            <rect x="24" y="150" width="196" height="92" rx="4" fill={NODE.fill} stroke="rgba(200,245,66,0.35)" />
            <rect x="24" y="150" width="2" height="92" fill={SIGNAL} />
            <circle cx="220" cy="196" r="2.5" fill={SIGNAL} />
            <text x="38" y="174" className="font-mono" fontSize="12.5" fill={TEXT}>
              user-service
            </text>
            <text x="38" y="191" className="font-mono" fontSize="8.5" letterSpacing="1.1" fill={SIGNAL}>
              ORIGIN · PR #41
            </text>
            <text x="38" y="209" className="font-mono" fontSize="9.5" fill={FAINT}>
              src/types.ts · User.id
            </text>
            <text x="38" y="227" className="font-mono" fontSize="9.5" fill={MUTED}>
              id: number → id: string
            </text>
          </g>

          {/* order-service */}
          <g className="fade-in" style={{ animationDelay: "0.3s" }}>
            <rect x="700" y="34" width="300" height="68" rx="4" fill={NODE.fill} stroke={NODE.stroke} />
            <rect x="700" y="34" width="2" height="68" fill={DANGER} />
            <text x="716" y="58" className="font-mono" fontSize="12.5" fill={TEXT}>
              order-service
            </text>
            <text x="716" y="75" className="font-mono" fontSize="8.5" letterSpacing="1.1" fill={DANGER}>
              CONFIRMED BREAKING
            </text>
            <text x="716" y="91" className="font-mono" fontSize="9.5" fill={FAINT}>
              src/orders.ts:22 · 95% confidence
            </text>
          </g>

          {/* billing-service */}
          <g className="fade-in" style={{ animationDelay: "0.38s" }}>
            <rect x="700" y="128" width="300" height="68" rx="4" fill={NODE.fill} stroke={NODE.stroke} />
            <rect x="700" y="128" width="2" height="68" fill={DANGER} />
            <text x="716" y="152" className="font-mono" fontSize="12.5" fill={TEXT}>
              billing-service
            </text>
            <text x="716" y="169" className="font-mono" fontSize="8.5" letterSpacing="1.1" fill={DANGER}>
              CONFIRMED BREAKING
            </text>
            <text x="716" y="185" className="font-mono" fontSize="9.5" fill={FAINT}>
              src/billing.ts:37 · deleteUser renamed
            </text>
          </g>

          {/* web-gateway */}
          <g className="fade-in" style={{ animationDelay: "0.46s" }}>
            <rect x="700" y="228" width="300" height="68" rx="4" fill={NODE.fill} stroke={NODE.stroke} />
            <rect x="700" y="228" width="2" height="68" fill={WARN} />
            <text x="716" y="252" className="font-mono" fontSize="12.5" fill={TEXT}>
              web-gateway
            </text>
            <text x="716" y="269" className="font-mono" fontSize="8.5" letterSpacing="1.1" fill={WARN}>
              POTENTIAL RISK · TRANSITIVE
            </text>
            <text x="716" y="285" className="font-mono" fontSize="9.5" fill={FAINT}>
              src/checkout.ts:5 · 76% · reached via order
            </text>
          </g>

          {/* updated test suite */}
          <g className="fade-in" style={{ animationDelay: "0.54s" }}>
            <rect x="700" y="314" width="300" height="62" rx="4" fill={NODE.fill} stroke={NODE.stroke} />
            <rect x="700" y="314" width="2" height="62" fill={OK} />
            <text x="716" y="338" className="font-mono" fontSize="12.5" fill={TEXT}>
              tests · user-service
            </text>
            <text x="716" y="355" className="font-mono" fontSize="8.5" letterSpacing="1.1" fill={OK}>
              NON-BREAKING
            </text>
            <text x="716" y="370" className="font-mono" fontSize="9.5" fill={FAINT}>
              updated in this PR
            </text>
          </g>
        </svg>
      </div>

      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">
        <span>Acme Commerce demo · 4 repositories</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-3" style={{ background: DANGER }} /> breaking
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-3" style={{ background: WARN }} /> potential
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-3" style={{ background: OK }} /> safe
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
