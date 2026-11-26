import { nodeKey, type Edge, type ProjectGraph } from "./graph";
import type { AffectedNode, Change, Finding, Fix, ImpactReport, PRAnalysis } from "./types";

export const human = (full: string) =>
  full
    .split("/")
    .pop()!
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

// ---------------------------------------------------------------- explanations

function opening(c: Change): string {
  const d = c.detail;
  const tag = c.verdict === "confirmed_breaking" ? "a breaking change" : "a potential compatibility risk";
  switch (c.kind) {
    case "param_type_changed":
      return `Changing the \`${d.paramName}\` parameter of \`${c.symbol}\` from \`${d.oldType}\` to \`${d.newType}\` is ${tag}.`;
    case "param_added_required":
      return `Adding the required parameter \`${d.paramName}\` to \`${c.symbol}\` is ${tag}: every existing caller must now supply it.`;
    case "param_made_required":
      return `Making \`${d.paramName}\` required in \`${c.symbol}\` is ${tag}.`;
    case "param_removed":
      return `Removing the \`${d.paramName}\` parameter from \`${c.symbol}\` is ${tag}.`;
    case "function_removed":
    case "export_removed":
      return `Removing \`${c.symbol}\` from the public API is ${tag}.`;
    case "function_renamed":
      return `Renaming \`${c.symbol}\` to \`${d.renamedTo}\` is ${tag} for anything that still uses the old name.`;
    case "type_removed":
      return `Deleting the type \`${c.symbol}\` is ${tag}.`;
    case "return_type_changed":
      return `Changing what \`${c.symbol}\` returns from \`${d.oldType}\` to \`${d.newType}\` is ${tag}: callers may not handle the new shape.`;
    case "route_removed":
      return `Removing the endpoint \`${c.symbol}\` is ${tag}.`;
    case "route_changed":
      return `Moving \`${c.symbol}\` to \`${d.newMethod} ${d.newPath}\` is ${tag} for every client still using the old URL.`;
    case "type_field_removed":
      return `Removing the \`${d.field}\` field from \`${c.symbol}\` is ${tag}.`;
    case "type_field_changed":
      return d.nowRequired
        ? `Making \`${c.symbol}.${d.field}\` required is ${tag}.`
        : `Changing \`${c.symbol}.${d.field}\` from \`${d.oldType}\` to \`${d.newType}\` is ${tag}.`;
    case "type_field_added":
      return `Adding the required field \`${d.field}\` to \`${c.symbol}\` is ${tag} for code that constructs this type.`;
    case "dep_version_changed":
      return `Upgrading \`${c.symbol}\` from ${d.oldVersion} to ${d.newVersion} is ${tag}: major releases often change behaviour and serialised shapes.`;
    case "dep_removed":
      return `Removing the dependency \`${c.symbol}\` is ${tag}.`;
    default:
      return `${c.summary}.`;
  }
}

export function explainChange(c: Change, report: ImpactReport): string {
  const fs = report.findings.filter((f) => f.changeId === c.id);
  const conf = fs.filter((f) => f.verdict === "confirmed");
  const pot = fs.filter((f) => f.verdict === "potential");
  const parts: string[] = [opening(c)];
  for (const f of conf.slice(0, 3)) parts.push(`${human(f.repoName)} will fail: ${f.reason}`);
  if (conf.length > 3) parts.push(`${conf.length - 3} more confirmed call site${conf.length - 3 === 1 ? "" : "s"} are affected.`);
  if (conf.length === 0) for (const f of pot.slice(0, 2)) parts.push(`${human(f.repoName)} may be affected: ${f.reason}`);
  const indirect = report.affected.filter((a) => a.changeId === c.id && a.repoHop >= 2);
  const indirectRepos = [...new Set(indirect.map((a) => human(a.repoName)))];
  if (indirectRepos.length) {
    const sample = indirect[0];
    parts.push(`Downstream, ${list(indirectRepos)} ${indirectRepos.length === 1 ? "is" : "are"} indirectly exposed through the chain ${sample.via.map((v) => `\`${v}\``).join(" → ")}.`);
  }
  if (fs.length === 0 && c.detail.note) parts.push(String(c.detail.note));
  return parts.join(" ");
}

export function summarize(repoName: string, report: ImpactReport, score: number, level: string): string {
  const confirmed = report.changes.filter((c) => c.verdict === "confirmed_breaking").length;
  const potential = report.changes.filter((c) => c.verdict === "potential_risk").length;
  const direct = report.repos.filter((r) => r.level === "direct").map((r) => human(r.name));
  const indirect = report.repos.filter((r) => r.level === "indirect").map((r) => human(r.name));
  const bits: string[] = [];
  bits.push(`${human(repoName)} changes ${report.changes.length} API surface${report.changes.length === 1 ? "" : "s"}: ${confirmed} confirmed breaking, ${potential} potential risk, ${report.changes.length - confirmed - potential} safe.`);
  if (direct.length) bits.push(`Directly affected: ${list(direct)}.`);
  if (indirect.length) bits.push(`Indirectly affected (blast radius): ${list(indirect)}.`);
  if (!direct.length && !indirect.length) bits.push("No downstream repositories are affected.");
  bits.push(`Risk score ${score}/100 (${level}).`);
  return bits.join(" ");
}

// ---------------------------------------------------------------- fixes

const indentOf = (s: string) => s.match(/^\s*/)?.[0] ?? "";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function defaultFor(type: string | undefined, name: string): string {
  const t = (type ?? "").replace(/\s/g, "");
  if (/currency/i.test(name)) return '"USD"';
  if (t === "string") return '""';
  if (t === "number") return "0";
  if (t === "boolean") return "false";
  return "undefined /* TODO */";
}

function insertArg(line: string, callee: string, arg: string): string | null {
  const i = line.indexOf(callee + "(");
  if (i < 0) return null;
  let depth = 0;
  for (let j = i + callee.length; j < line.length; j++) {
    if (line[j] === "(") depth++;
    else if (line[j] === ")") {
      depth--;
      if (depth === 0) {
        const inner = line.slice(i + callee.length + 1, j).trim();
        return line.slice(0, j) + (inner ? ", " : "") + arg + line.slice(j);
      }
    }
  }
  return null;
}

function replacePath(line: string, oldPath: string, newPath: string): string | null {
  const pattern = oldPath
    .split("/")
    .map((s) => (s.startsWith(":") ? "(\\$\\{[^}]*\\}|[^/\"'`?]+)" : esc(s)))
    .join("/");
  const re = new RegExp(pattern);
  const m = line.match(re);
  if (!m) return null;
  let gi = 1;
  const repl = newPath
    .split("/")
    .map((s) => (s.startsWith(":") ? (m[gi++] ?? s) : s))
    .join("/");
  return line.replace(re, repl);
}

function hunk(file: string, line: number, before: string, after: string[]) {
  return `--- a/${file}\n+++ b/${file}\n@@ -${line} @@\n- ${before.trimEnd()}\n${after.map((a) => `+ ${a.trimEnd()}`).join("\n")}`;
}

function prefixFor(sym: Change["oldSym"]) {
  if (!sym) return "";
  if (sym.kind === "method") return "";
  return `export ${sym.async ? "async " : ""}function `;
}

function producerFix(c: Change, repoName: string): Fix | null {
  const d = c.detail;
  const o = c.oldSym;
  const n = c.newSym;
  const base = { id: `${c.id}:producer`, changeId: c.id, role: "producer" as const, repoId: c.repoId, repoName, file: c.file, line: c.line };
  switch (c.kind) {
    case "param_type_changed": {
      if (!n) return null;
      const compat = n.params.map((p, i) => (i === Number(d.paramIndex) ? `${p.name}: ${d.newType} | ${d.oldType}` : `${p.name}${p.optional ? "?" : ""}${p.type ? ": " + p.type : ""}`)).join(", ");
      const ret = n.returnType ? `: ${n.returnType}` : "";
      return { ...base, title: `Accept both \`${d.oldType}\` and \`${d.newType}\` for \`${d.paramName}\``, description: `Widen the signature so existing callers keep compiling, then deprecate the old type once consumers migrate.`, patch: hunk(c.file, c.line, `${prefixFor(n)}${n.signature}`, [`/** @deprecated ${d.oldType} ${d.paramName} values — migrate callers to ${d.newType} */`, `${prefixFor(n)}${n.name}(${compat})${ret} {`, `  const ${d.paramName}Normalized = ${String(d.newType).includes("string") ? `String(${d.paramName})` : `Number(${d.paramName})`};`]) };
    }
    case "param_added_required": {
      if (!n) return null;
      const p = n.params[Number(d.paramIndex)];
      const compat = n.params.map((x, i) => (i === Number(d.paramIndex) ? `${x.name}: ${x.type || "unknown"} = ${defaultFor(x.type, x.name)}` : `${x.name}${x.optional ? "?" : ""}${x.type ? ": " + x.type : ""}`)).join(", ");
      return { ...base, title: `Give \`${p.name}\` a default so existing callers keep working`, description: "Make the new parameter backward compatible; make it required in the next major release.", patch: hunk(c.file, c.line, `${prefixFor(n)}${n.signature}`, [`${prefixFor(n)}${n.name}(${compat})${n.returnType ? ": " + n.returnType : ""} {`]) };
    }
    case "function_renamed":
      return { ...base, title: `Keep \`${c.symbol}\` as a deprecated alias of \`${d.renamedTo}\``, description: "Re-export the old name for one release cycle so consumers can migrate on their own schedule.", patch: hunk(c.file, c.line, `// (old name removed)`, [`/** @deprecated use ${d.renamedTo} */`, `export const ${c.symbol} = ${d.renamedTo};`]) };
    case "function_removed":
    case "export_removed":
      return { ...base, title: `Deprecate \`${c.symbol}\` instead of removing it`, description: "Keep the export (marked @deprecated) for at least one release, or ship a codemod to the dependent repositories.", patch: hunk(c.file, c.line, `// \`${c.symbol}\` deleted`, [`/** @deprecated will be removed in the next major version */`, `export ${o?.kind === "class" ? "class" : "function"} ${c.symbol} { /* restore previous implementation */ }`]) };
    case "route_changed":
    case "route_removed": {
      const m = String(d.oldMethod).toLowerCase();
      return { ...base, title: `Keep the legacy route \`${d.oldMethod} ${d.oldPath}\` alive`, description: "Serve the old URL alongside the new one with a Deprecation header until all clients have moved.", patch: hunk(c.file, c.line, `// route removed: ${d.oldMethod} ${d.oldPath}`, [`app.${m}("${d.oldPath}", ${o?.handler ?? n?.handler ?? "legacyHandler"}); // @deprecated — add 'Deprecation: true' header`]) };
    }
    case "type_field_removed":
      return { ...base, title: `Keep \`${d.field}\` as a deprecated optional field`, description: "Consumers reading the field keep compiling; remove in the next major version.", patch: hunk(c.file, c.line, `// field removed: ${d.field}`, [`/** @deprecated */`, `${d.field}?: ${d.oldType};`]) };
    case "type_field_changed":
      if (d.nowRequired) return null;
      return { ...base, title: `Widen \`${c.symbol}.${d.field}\` to accept both types`, description: "Use a union during the migration window, then narrow it.", patch: hunk(c.file, c.line, `${d.field}: ${d.newType};`, [`${d.field}: ${d.newType} | ${d.oldType}; // @deprecated ${d.oldType}`]) };
    case "type_field_added":
      return { ...base, title: `Make \`${d.field}\` optional`, description: "Existing producers of this type continue to compile.", patch: hunk(c.file, c.line, `${d.field}: ${d.newType};`, [`${d.field}?: ${d.newType};`]) };
    case "return_type_changed": {
      if (!n) return null;
      return { ...base, title: `Keep \`${c.symbol}\` returning \`${d.oldType}\``, description: `Expose the new behaviour through a separate function so existing callers aren't forced to handle \`${d.newType}\`.`, patch: hunk(c.file, c.line, `${prefixFor(n)}${n.signature}`, [`${prefixFor(n)}${n.name}OrNull(${n.params.map((p) => `${p.name}${p.type ? ": " + p.type : ""}`).join(", ")}): ${d.newType} {  // new behaviour`, `// keep: ${n.name}(...): ${d.oldType}  (throws instead of returning null)`]) };
    }
    case "dep_version_changed":
      return { ...base, title: `Stage the \`${c.symbol}\` upgrade`, description: `Upgrade ${c.symbol} behind a compatibility test run in this repo, publish as a pre-release, and run dependants' contract tests before merging.`, patch: "" };
    default:
      return null;
  }
}

function edgeOf(graph: ProjectGraph, c: Change, f: Finding): Edge | undefined {
  const list = graph.byTarget.get(nodeKey(c.repoId, c.file, c.symbol)) ?? [];
  return list.find((e) => e.fromRepo === f.repoId && e.fromFile === f.file && e.line === f.line && e.kind !== "import");
}

function consumerFix(graph: ProjectGraph, c: Change, f: Finding): Fix | null {
  const d = c.detail;
  const e = edgeOf(graph, c, f);
  const line = f.text;
  const base = { id: `${f.id}:fix`, changeId: c.id, role: "consumer" as const, repoId: f.repoId, repoName: f.repoName, file: f.file, line: f.line };
  switch (c.kind) {
    case "param_type_changed": {
      const arg = e?.call?.args[Number(d.paramIndex)];
      if (!arg) return null;
      const nt = String(d.newType);
      let wrap: string | null = null;
      if (arg.type === "number" && nt.includes("string")) wrap = `String(${arg.text})`;
      else if (arg.type === "string" && nt.includes("number")) wrap = `Number(${arg.text})`;
      if (!wrap) return { ...base, title: `Pass a \`${nt}\` for \`${d.paramName}\``, description: `Convert the argument to \`${nt}\` at ${f.file}:${f.line}.`, patch: "" };
      return { ...base, title: `Convert \`${arg.text}\` to ${nt}`, description: `Wrap the argument so it matches the new \`${nt}\` parameter. Prefer migrating the source of \`${arg.text}\` to ${nt} ids long-term.`, patch: hunk(f.file, f.line, line, [line.replace(arg.text, wrap)]) };
    }
    case "param_added_required": {
      const call = e?.call;
      if (!call) return null;
      const arg = defaultFor(String(d.newType), String(d.paramName));
      const callee = call.object && !call.isNew ? `${call.object}.${call.name}` : call.name;
      const after = insertArg(line, callee, arg) ?? insertArg(line, call.name, arg);
      if (!after) return { ...base, title: `Pass the new \`${d.paramName}\` argument`, description: `Supply \`${d.paramName}\` at ${f.file}:${f.line}.`, patch: "" };
      return { ...base, title: `Pass \`${arg}\` for the new \`${d.paramName}\` argument`, description: `Decide the correct value for \`${d.paramName}\` — the default shown here preserves existing behaviour.`, patch: hunk(f.file, f.line, line, [after]) };
    }
    case "function_renamed": {
      const re = new RegExp(`\\b${esc(c.symbol)}\\b`, "g");
      let patch = hunk(f.file, f.line, line, [line.replace(re, String(d.renamedTo))]);
      const imp = graph.edges.find((x) => x.kind === "import" && x.fromRepo === f.repoId && x.fromFile === f.file && x.toSymbol === c.symbol);
      if (imp && imp.line !== f.line) patch = hunk(f.file, imp.line, imp.text, [imp.text.replace(re, String(d.renamedTo))]) + "\n" + patch;
      return { ...base, title: `Use \`${d.renamedTo}\` instead of \`${c.symbol}\``, description: "Mechanical rename of the import and the call site.", patch };
    }
    case "route_changed": {
      const after = replacePath(line, String(d.oldPath), String(d.newPath));
      if (!after) return null;
      return { ...base, title: `Call \`${d.newMethod} ${d.newPath}\``, description: "Point the client at the new endpoint URL.", patch: hunk(f.file, f.line, line, [after]) };
    }
    case "return_type_changed": {
      const v = e?.call?.assignedTo;
      if (!v || !/null|undefined/.test(String(d.newType))) return { ...base, title: `Handle the new \`${d.newType}\` result`, description: `Review how the result of \`${c.symbol}\` is used at ${f.file}:${f.line}.`, patch: "" };
      return { ...base, title: `Guard against a missing \`${v}\``, description: `\`${c.symbol}\` can now return null/undefined — fail fast or handle the empty case.`, patch: hunk(f.file, f.line, line, [line, `${indentOf(line)}if (!${v}) throw new Error("${c.symbol}: no result");`]) };
    }
    case "function_removed":
    case "export_removed":
      return { ...base, title: `Replace usage of removed \`${c.symbol}\``, description: `Find the replacement API for \`${c.symbol}\` or pin the previous version of the dependency until it exists.`, patch: "" };
    case "type_field_removed":
      return { ...base, title: `Stop reading \`.${d.field}\``, description: `\`${d.field}\` no longer exists on \`${c.symbol}\`; derive the value elsewhere.`, patch: "" };
    default:
      return null;
  }
}

export function generateFixes(graph: ProjectGraph, report: ImpactReport): Fix[] {
  const fixes: Fix[] = [];
  for (const c of report.changes) {
    if (c.verdict === "non_breaking" || !c.verdict) continue;
    const repoName = graph.repoById.get(c.repoId)?.fullName ?? "";
    const p = producerFix(c, repoName);
    if (p) fixes.push(p);
    const fs = report.findings.filter((f) => f.changeId === c.id && f.edgeKind !== "dependency");
    for (const f of fs.slice(0, 6)) {
      const cf = consumerFix(graph, c, f);
      if (cf) fixes.push(cf);
    }
  }
  return fixes;
}

// ---------------------------------------------------------------- verify

export function verifyChecklist(report: ImpactReport, tests: PRAnalysis["tests"]): string[] {
  const out: string[] = [];
  const act = (c: Change): string => {
    const d = c.detail;
    switch (c.kind) {
      case "param_type_changed": return `confirm it passes a \`${d.newType}\` for \`${d.paramName}\``;
      case "param_added_required": return `supply the new \`${d.paramName}\` argument`;
      case "param_removed": return `stop passing \`${d.paramName}\``;
      case "function_renamed": return `switch to \`${d.renamedTo}\``;
      case "function_removed": return "migrate away from the removed function";
      case "route_changed": return `update the URL to \`${d.newMethod} ${d.newPath}\``;
      case "route_removed": return "stop calling the removed endpoint";
      case "return_type_changed": return "handle the new return type";
      case "type_field_removed": return `check usages of \`.${d.field}\``;
      case "type_field_changed": return `check usages of \`.${d.field}\` against the new type`;
      default: return "verify behaviour is unchanged";
    }
  };
  const byId = new Map(report.changes.map((c) => [c.id, c]));
  const sorted = [...report.findings].sort((a, b) => (a.verdict === b.verdict ? b.confidence - a.confidence : a.verdict === "confirmed" ? -1 : 1));
  for (const f of sorted.slice(0, 8)) {
    const c = byId.get(f.changeId);
    if (!c) continue;
    if (f.edgeKind === "dependency") out.push(`Run ${human(f.repoName)} integration tests against the upgraded \`${c.symbol}\`.`);
    else out.push(`In ${f.repoName}, check \`${f.symbol === "<module>" ? f.file : f.symbol}\` (${f.file}:${f.line}) — ${act(c)}.`);
  }
  const must = tests.recommended.filter((t) => t.priority === "must").slice(0, 3);
  if (must.length) out.push(`Run required test suites: ${must.map((t) => `${t.repoName}/${t.file}`).join(", ")}.`);
  if (tests.missing.length) out.push(`Add tests for uncovered symbols: ${tests.missing.slice(0, 3).map((m) => `\`${m.symbol}\``).join(", ")}.`);
  return out;
}

// ---------------------------------------------------------------- optional LLM

export async function llmEnhance(
  repoName: string,
  report: ImpactReport,
  baseline: { summary: string; explanations: Record<string, string> },
): Promise<{ summary: string; explanations: Record<string, string> } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const risky = report.changes.filter((c) => c.verdict !== "non_breaking").slice(0, 8);
  if (risky.length === 0) return null;
  const payload = {
    repository: repoName,
    changes: risky.map((c) => ({
      id: c.id,
      summary: c.summary,
      verdict: c.verdict,
      findings: report.findings.filter((f) => f.changeId === c.id).slice(0, 4).map((f) => ({ repo: f.repoName, where: `${f.file}:${f.line}`, symbol: f.symbol, verdict: f.verdict, reason: f.reason })),
      indirect: report.affected.filter((a) => a.changeId === c.id && a.repoHop >= 2).slice(0, 3).map((a) => ({ repo: a.repoName, chain: a.via })),
    })),
  };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: 'You are a senior engineer explaining cross-repository breaking changes to a teammate. Use plain, specific language; name the services and functions. Respond as JSON: {"summary": string (2-3 sentences), "explanations": {"<change id>": string (2-3 sentences: what changes, who breaks and why, what to do)}}. Only use facts from the input.' },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = await res.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    return {
      summary: typeof parsed.summary === "string" ? `${parsed.summary} ${baseline.summary.split(". ").pop()}` : baseline.summary,
      explanations: { ...baseline.explanations, ...(parsed.explanations ?? {}) },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- PR comment

export function buildPrComment(opts: {
  repo: string;
  number: number;
  analysis: PRAnalysis;
  fixStatus: Record<string, string>;
  baseUrl?: string;
}): string {
  const a = opts.analysis;
  const icon = a.risk.level === "high" ? "🔴" : a.risk.level === "medium" ? "🟠" : "🟢";
  const L: string[] = [];
  L.push(`## ${icon} DevImpact — risk **${a.risk.score}/100** (${a.risk.level})`);
  L.push("", a.summary, "");
  const bc = a.changes.filter((c) => c.verdict === "confirmed_breaking");
  const pr = a.changes.filter((c) => c.verdict === "potential_risk");
  if (bc.length) {
    L.push("### ❌ Confirmed breaking changes");
    for (const c of bc) L.push(`- **${c.summary}**\n  ${a.explanations[c.id] ?? ""}`);
    L.push("");
  }
  if (pr.length) {
    L.push("### ⚠️ Potential risks");
    for (const c of pr) L.push(`- ${c.summary}`);
    L.push("");
  }
  const impacted = a.repos.filter((r) => r.level !== "origin");
  if (impacted.length) {
    L.push("### 💥 Blast radius", "", "| Repository | Reach | Severity | Confidence | Confirmed / potential |", "|---|---|---|---|---|");
    for (const r of impacted) L.push(`| ${r.name} | ${r.level} | ${r.severity} | ${Math.round(r.confidence * 100)}% | ${r.confirmed} / ${r.potential} |`);
    L.push("");
  }
  const mustTests = a.tests.recommended.filter((t) => t.priority === "must");
  if (mustTests.length) {
    L.push("### 🧪 Run before merging");
    for (const t of mustTests) L.push(`- \`${t.repoName}/${t.file}\` — ${t.reason}`);
    L.push("");
  }
  const approved = a.fixes.filter((f) => opts.fixStatus[f.id] === "approved");
  if (approved.length) {
    L.push("### 🛠 Reviewer-approved suggestions");
    for (const f of approved) L.push(`- **${f.title}** (${f.repoName}/${f.file}:${f.line})\n\n\`\`\`diff\n${f.patch}\n\`\`\``);
    L.push("");
  }
  L.push("_Suggestions are advisory only — DevImpact never modifies code without developer approval._");
  return L.join("\n");
}

export type { AffectedNode };
