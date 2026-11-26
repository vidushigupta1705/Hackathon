import ts from "typescript";
import type {
  CallInfo,
  HttpCallInfo,
  ImportInfo,
  ParamInfo,
  ParsedFile,
  SymbolInfo,
  SymbolKind,
} from "./types";

const VERBS = new Set(["get", "post", "put", "delete", "patch"]);
const SERVER_OBJECTS = new Set(["app", "router", "server", "fastify"]);
const TEST_RE = /(\.test\.|\.spec\.|__tests__\/|(^|\/)tests?\/)/;
export const SOURCE_RE = /\.(tsx?|jsx?|mjs|cjs)$/;

function hash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export function isTestPath(p: string) {
  return TEST_RE.test(p);
}

export function normalizeUrlPath(raw: string): string | null {
  let p = raw.replace(/^https?:\/\/[^/]+/, "");
  if (p.startsWith("{}")) p = p.slice(2);
  p = p.split("?")[0].split("#")[0];
  if (!p.startsWith("/")) {
    const idx = p.indexOf("/");
    if (idx < 0) return null;
    p = p.slice(idx);
  }
  p = p.replace(/\{\}/g, ":p");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export function routePathFromFile(file: string): string | null {
  const m = file.match(/(?:^|\/)app\/(.*)\/?route\.(?:t|j)sx?$/) ?? file.match(/(?:^|\/)app\/route\.(?:t|j)sx?$/);
  if (!m) return null;
  const dir = (m[1] ?? "").replace(/\/$/, "");
  const segs = dir
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .map((s) => s.replace(/^\[\.\.\.(.+)\]$/, ":$1").replace(/^\[(.+)\]$/, ":$1"));
  return "/" + segs.join("/");
}

export function parseFile(path: string, content: string): ParsedFile {
  const out: ParsedFile = {
    path,
    isTest: isTestPath(path),
    symbols: [],
    imports: [],
    calls: [],
    httpCalls: [],
    propAccess: [],
    typeRefs: [],
  };

  if (path === "package.json" || path.endsWith("/package.json")) {
    try {
      const j = JSON.parse(content);
      out.pkg = {
        name: j.name,
        version: j.version,
        dependencies: { ...(j.dependencies ?? {}), ...(j.peerDependencies ?? {}) },
        devDependencies: j.devDependencies ?? {},
      };
    } catch {
      /* ignore invalid manifest */
    }
    return out;
  }
  if (!SOURCE_RE.test(path) || path.endsWith(".d.ts")) return out;

  const scriptKind = path.endsWith("x")
    ? path.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.JSX
    : /\.(js|mjs|cjs)$/.test(path)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKind);
  const lines = content.split("\n");
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
  const textOf = (n: ts.Node) => (lines[lineOf(n)] ?? "").slice(0, 220);
  const propSet = new Set<string>();
  const typeSet = new Set<string>();
  const exportedNames = new Set<string>();

  const scopes: Map<string, string>[] = [new Map()];
  const lookup = (n: string): string | undefined => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const v = scopes[i].get(n);
      if (v) return v;
    }
    return undefined;
  };

  const unwrap = (e: ts.Expression): ts.Expression => {
    let cur = e;
    for (;;) {
      if (ts.isParenthesizedExpression(cur) || ts.isAwaitExpression(cur) || ts.isNonNullExpression(cur)) cur = cur.expression;
      else break;
    }
    return cur;
  };

  const inferType = (e0: ts.Expression | undefined): string => {
    if (!e0) return "unknown";
    if (ts.isAsExpression(e0)) return norm(e0.type.getText(sf));
    const e = unwrap(e0);
    if (ts.isNumericLiteral(e)) return "number";
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) return "string";
    if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return "boolean";
    if (ts.isObjectLiteralExpression(e)) return "object";
    if (ts.isArrayLiteralExpression(e)) return "array";
    if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)) return "number";
    if (ts.isNewExpression(e) && ts.isIdentifier(e.expression)) return e.expression.text;
    if (ts.isIdentifier(e)) return lookup(e.text) ?? "unknown";
    if (ts.isPropertyAccessExpression(e)) {
      const t = e.getText(sf);
      if (/^req(uest)?\.(params|query|headers)\./.test(t)) return "string";
      if (e.name.text === "length") return "number";
      return lookup(t) ?? "unknown";
    }
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
      const n = e.expression.text;
      if (n === "Number" || n === "parseInt" || n === "parseFloat") return "number";
      if (n === "String") return "string";
      if (n === "Boolean") return "boolean";
    }
    return "unknown";
  };

  const exprToUrl = (e0: ts.Expression, top: boolean): string | null => {
    const e = unwrap(e0);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isTemplateExpression(e)) return e.head.text + e.templateSpans.map((s) => "{}" + s.literal.text).join("");
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return (exprToUrl(e.left, false) ?? "{}") + (exprToUrl(e.right, false) ?? "{}");
    }
    return top ? null : "{}";
  };

  const hasExport = (n: ts.Node) =>
    ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const hasDefault = (n: ts.Node) =>
    ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

  const paramsOf = (fn: ts.SignatureDeclarationBase): ParamInfo[] =>
    fn.parameters.map((p) => ({
      name: p.name.getText(sf),
      type: p.type ? norm(p.type.getText(sf)) : p.initializer ? inferType(p.initializer) === "unknown" ? "" : inferType(p.initializer) : "",
      optional: !!p.questionToken,
      hasDefault: !!p.initializer,
      rest: !!p.dotDotDotToken,
    }));

  const sigString = (name: string, params: ParamInfo[], ret: string) =>
    `${name}(${params
      .map((p) => `${p.rest ? "..." : ""}${p.name}${p.optional ? "?" : ""}${p.type ? ": " + p.type : ""}${p.hasDefault ? " = …" : ""}`)
      .join(", ")})${ret ? ": " + ret : ""}`;

  const addFn = (
    name: string,
    kind: SymbolKind,
    node: ts.SignatureDeclarationBase,
    declNode: ts.Node,
    exported: boolean,
    body: ts.Node | undefined,
  ) => {
    const params = paramsOf(node);
    const returnType = node.type ? norm(node.type.getText(sf)) : "";
    const isAsync = ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    out.symbols.push({
      name,
      kind,
      file: path,
      line: lineOf(declNode) + 1,
      exported,
      params,
      returnType,
      async: isAsync,
      signature: sigString(name, params, returnType),
      bodyHash: body ? hash(body.getText(sf).replace(/\s+/g, "")) : undefined,
    });
  };

  const fieldsOf = (members: readonly ts.TypeElement[]) =>
    members
      .filter(ts.isPropertySignature)
      .map((m) => ({
        name: m.name.getText(sf),
        type: m.type ? norm(m.type.getText(sf)) : "any",
        optional: !!m.questionToken,
      }));

  const isFnInit = (e?: ts.Expression): e is ts.ArrowFunction | ts.FunctionExpression =>
    !!e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e));

  const pushFnScope = (fn: ts.SignatureDeclarationBase) => {
    const m = new Map<string, string>();
    for (const p of fn.parameters) {
      if (!ts.isIdentifier(p.name)) continue;
      const t = p.type ? norm(p.type.getText(sf)) : p.initializer ? inferType(p.initializer) : "unknown";
      m.set(p.name.text, t);
    }
    scopes.push(m);
  };

  const recordCall = (node: ts.CallExpression | ts.NewExpression, enclosing: string) => {
    const expr = node.expression;
    let name: string | undefined;
    let object: string | undefined;
    if (ts.isIdentifier(expr)) name = expr.text;
    else if (ts.isPropertyAccessExpression(expr)) {
      name = expr.name.text;
      object = expr.expression.getText(sf).slice(0, 60);
    }
    if (!name) return;
    const isNew = ts.isNewExpression(node);

    // ---- HTTP client / server route detection
    const args = node.arguments ? Array.from(node.arguments) : [];
    if (!isNew && ts.isIdentifier(expr) && name === "fetch" && args[0]) {
      const raw = exprToUrl(args[0], true);
      const p = raw ? normalizeUrlPath(raw) : null;
      if (p) {
        let method = "GET";
        const opt = args[1] && unwrap(args[1]);
        if (opt && ts.isObjectLiteralExpression(opt)) {
          for (const prop of opt.properties) {
            if (ts.isPropertyAssignment(prop) && prop.name.getText(sf) === "method" && ts.isStringLiteralLike(prop.initializer)) {
              method = prop.initializer.text.toUpperCase();
            }
          }
        }
        out.httpCalls.push({ method, path: p, enclosing, line: lineOf(node) + 1, text: textOf(node) });
        return;
      }
    }
    if (!isNew && object !== undefined && VERBS.has(name) && args[0]) {
      const raw = exprToUrl(args[0], true);
      const p = raw ? normalizeUrlPath(raw) : null;
      if (p) {
        const hasFn = args.slice(1).some((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
        const lastIdent = args.length >= 2 && ts.isIdentifier(args[args.length - 1]);
        if (hasFn || (lastIdent && SERVER_OBJECTS.has(object))) {
          const last = args[args.length - 1];
          out.symbols.push({
            name: `${name.toUpperCase()} ${p}`,
            kind: "route",
            file: path,
            line: lineOf(node) + 1,
            exported: true,
            params: [],
            returnType: "",
            async: false,
            signature: `${name.toUpperCase()} ${p}`,
            handler: ts.isIdentifier(last) ? last.text : undefined,
            route: { method: name.toUpperCase(), path: p },
            bodyHash: hasFn ? hash(last.getText(sf).replace(/\s+/g, "")) : undefined,
          });
          return;
        }
        if (!SERVER_OBJECTS.has(object)) {
          out.httpCalls.push({ method: name.toUpperCase(), path: p, enclosing, line: lineOf(node) + 1, text: textOf(node) });
          return;
        }
      }
    }

    // ---- ordinary call
    let parent: ts.Node = node.parent;
    while (ts.isAwaitExpression(parent) || ts.isParenthesizedExpression(parent)) parent = parent.parent;
    const usesResult = !ts.isExpressionStatement(parent);
    let assignedTo: string | undefined;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) assignedTo = parent.name.text;
    const call: CallInfo = {
      name,
      object,
      objectType: object && /^[A-Za-z_$][\w$]*$/.test(object) ? lookup(object) : undefined,
      isNew,
      enclosing,
      line: lineOf(node) + 1,
      text: textOf(node),
      args: args.map((a) => ({
        text: a.getText(sf).slice(0, 80),
        type: ts.isSpreadElement(a) ? "spread" : inferType(a),
      })),
      usesResult,
      assignedTo,
    };
    out.calls.push(call);
  };

  const routeNameFor = (node: ts.CallExpression): string | null => {
    const e = node.expression;
    if (!ts.isPropertyAccessExpression(e) || !VERBS.has(e.name.text) || !node.arguments[0]) return null;
    const obj = e.expression.getText(sf);
    const raw = exprToUrl(node.arguments[0], true);
    const p = raw ? normalizeUrlPath(raw) : null;
    if (!p) return null;
    const args = Array.from(node.arguments);
    const hasFn = args.slice(1).some((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
    if (hasFn || (args.length >= 2 && ts.isIdentifier(args[args.length - 1]) && SERVER_OBJECTS.has(obj))) {
      return `${e.name.text.toUpperCase()} ${p}`;
    }
    return null;
  };

  const visit = (node: ts.Node, enclosing: string): void => {
    // ---- imports / exports
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const info: ImportInfo = { module: node.moduleSpecifier.text, named: [], line: lineOf(node) + 1, text: textOf(node) };
      const c = node.importClause;
      if (c) {
        if (c.name) info.default = c.name.text;
        if (c.namedBindings) {
          if (ts.isNamespaceImport(c.namedBindings)) info.namespace = c.namedBindings.name.text;
          else for (const el of c.namedBindings.elements) info.named.push({ name: (el.propertyName ?? el.name).text, alias: el.name.text });
        }
      }
      out.imports.push(info);
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const info: ImportInfo = { module: node.moduleSpecifier.text, named: [], line: lineOf(node) + 1, text: textOf(node) };
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) info.named.push({ name: (el.propertyName ?? el.name).text, alias: el.name.text });
        }
        out.imports.push(info);
      } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) exportedNames.add((el.propertyName ?? el.name).text);
      }
      return;
    }

    // ---- declarations
    if (ts.isFunctionDeclaration(node) && node.body) {
      const name = node.name?.text ?? "default";
      addFn(name, "function", node, node, hasExport(node) || hasDefault(node), node.body);
      pushFnScope(node);
      ts.forEachChild(node, (c) => visit(c, name));
      scopes.pop();
      return;
    }
    if (ts.isVariableStatement(node)) {
      const exported = hasExport(node);
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && isFnInit(d.initializer)) {
          addFn(d.name.text, "function", d.initializer, d, exported, d.initializer.body);
          pushFnScope(d.initializer);
          ts.forEachChild(d.initializer, (c) => visit(c, (d.name as ts.Identifier).text));
          scopes.pop();
        } else {
          if (d.initializer) visit(d.initializer, enclosing);
          if (ts.isIdentifier(d.name)) {
            scopes[scopes.length - 1].set(d.name.text, d.type ? norm(d.type.getText(sf)) : inferType(d.initializer));
          }
        }
      }
      return;
    }
    if (ts.isVariableDeclaration(node) && !ts.isVariableStatement(node.parent)) {
      if (node.initializer) visit(node.initializer, enclosing);
      if (ts.isIdentifier(node.name)) {
        scopes[scopes.length - 1].set(node.name.text, node.type ? norm(node.type.getText(sf)) : inferType(node.initializer));
      }
      return;
    }
    if (ts.isClassDeclaration(node) && node.name) {
      const cname = node.name.text;
      const exported = hasExport(node) || hasDefault(node);
      const ctor = node.members.find(ts.isConstructorDeclaration);
      const params = ctor ? paramsOf(ctor) : [];
      out.symbols.push({
        name: cname,
        kind: "class",
        file: path,
        line: lineOf(node) + 1,
        exported,
        params,
        returnType: "",
        async: false,
        signature: sigString(`new ${cname}`, params, ""),
        bodyHash: ctor?.body ? hash(ctor.body.getText(sf).replace(/\s+/g, "")) : undefined,
      });
      for (const m of node.members) {
        if (ts.isMethodDeclaration(m) && m.name) {
          const isPrivate = !!ts.getModifiers(m)?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword);
          const mname = `${cname}.${m.name.getText(sf)}`;
          addFn(mname, "method", m, m, exported && !isPrivate, m.body);
          if (m.body) {
            pushFnScope(m);
            ts.forEachChild(m, (c) => visit(c, mname));
            scopes.pop();
          }
        } else if (ts.isConstructorDeclaration(m) && m.body) {
          pushFnScope(m);
          ts.forEachChild(m, (c) => visit(c, `${cname}.constructor`));
          scopes.pop();
        }
      }
      return;
    }
    if (ts.isInterfaceDeclaration(node)) {
      out.symbols.push({
        name: node.name.text,
        kind: "interface",
        file: path,
        line: lineOf(node) + 1,
        exported: hasExport(node),
        params: [],
        returnType: "",
        async: false,
        signature: `interface ${node.name.text}`,
        fields: fieldsOf(node.members),
      });
      ts.forEachChild(node, (c) => visit(c, enclosing));
      return;
    }
    if (ts.isTypeAliasDeclaration(node)) {
      out.symbols.push({
        name: node.name.text,
        kind: "type",
        file: path,
        line: lineOf(node) + 1,
        exported: hasExport(node),
        params: [],
        returnType: norm(node.type.getText(sf)),
        async: false,
        signature: `type ${node.name.text}`,
        fields: ts.isTypeLiteralNode(node.type) ? fieldsOf(node.type.members) : undefined,
      });
      ts.forEachChild(node, (c) => visit(c, enclosing));
      return;
    }
    if (ts.isEnumDeclaration(node)) {
      out.symbols.push({
        name: node.name.text,
        kind: "enum",
        file: path,
        line: lineOf(node) + 1,
        exported: hasExport(node),
        params: [],
        returnType: "",
        async: false,
        signature: `enum ${node.name.text}`,
        fields: node.members.map((m) => ({ name: m.name.getText(sf), type: m.initializer ? norm(m.initializer.getText(sf)) : "auto", optional: false })),
      });
      return;
    }

    // ---- calls
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const routeName = ts.isCallExpression(node) ? routeNameFor(node) : null;
      recordCall(node, enclosing);
      ts.forEachChild(node, (c) => visit(c, routeName ?? enclosing));
      return;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      pushFnScope(node);
      ts.forEachChild(node, (c) => visit(c, enclosing));
      scopes.pop();
      return;
    }

    // ---- accesses & type refs
    if (ts.isPropertyAccessExpression(node)) propSet.add(node.name.text);
    if (ts.isBindingElement(node)) propSet.add(((node.propertyName ?? node.name) as ts.Identifier).text ?? "");
    if (ts.isTypeReferenceNode(node)) {
      const tn = node.typeName;
      typeSet.add(ts.isIdentifier(tn) ? tn.text : tn.right.text);
    }
    ts.forEachChild(node, (c) => visit(c, enclosing));
  };

  ts.forEachChild(sf, (c) => visit(c, "<module>"));

  // `export { a, b }` lists
  for (const s of out.symbols) if (exportedNames.has(s.name)) s.exported = true;

  // Next.js route handlers (app/**/route.ts)
  const rp = routePathFromFile(path);
  if (rp) {
    const renames = new Map<string, string>();
    for (const s of out.symbols) {
      if (s.kind === "function" && s.exported && /^(GET|POST|PUT|DELETE|PATCH)$/.test(s.name)) {
        const old = s.name;
        s.kind = "route";
        s.route = { method: old, path: rp };
        s.name = `${old} ${rp}`;
        s.signature = s.name;
        renames.set(old, s.name);
      }
    }
    for (const c of out.calls) if (renames.has(c.enclosing)) c.enclosing = renames.get(c.enclosing)!;
    for (const c of out.httpCalls) if (renames.has(c.enclosing)) c.enclosing = renames.get(c.enclosing)!;
  }

  out.propAccess = [...propSet].filter(Boolean);
  out.typeRefs = [...typeSet];
  return out;
}

export function parseFiles(files: { path: string; content: string }[]): ParsedFile[] {
  return files.map((f) => parseFile(f.path, f.content));
}

export type { SymbolInfo, HttpCallInfo };
