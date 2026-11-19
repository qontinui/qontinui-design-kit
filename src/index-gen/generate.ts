/**
 * The generated component index. Contracts are generated from code, never
 * hand-written, because hand-maintained descriptions made agents re-implement
 * components (report 4.6). Props come from the TypeScript source or
 * declarations (the compiler API), variants and states from the component
 * data, the tokens from the component's own rules, and the usage note from its
 * JSDoc (`@use` and `@avoid`).
 *
 * `design-kit index` writes the block between the markers in a project's
 * `CLAUDE.md`, so every harness that reads `CLAUDE.md` loads it;
 * `design-kit index --check` exits 1 on drift.
 */
import fs from "node:fs";
import path from "node:path";
import type { KitEntry } from "../kit/registry.js";
import { tokensOf } from "../kit/registry.js";

export const MARK_START = "<!-- design-kit-index:start -->";
export const MARK_END = "<!-- design-kit-index:end -->";
/** The index of the eight-component slice must fit this; a ninth component that does not fit gets trimmed JSDoc, never a higher limit. */
export const INDEX_BYTE_LIMIT = 8192;

type TS = typeof import("typescript");

export interface PropDoc {
  name: string;
  optional: boolean;
  type: string;
}

export interface ComponentDoc {
  name: string;
  summary: string;
  use: string;
  avoid: string;
  /** null: the props type is not an interface in the same file, so the contract cannot be read. */
  props: PropDoc[] | null;
}

const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if ((e.name.endsWith(".tsx") || e.name.endsWith(".d.ts")) && !e.name.endsWith(".test.tsx")) out.push(p);
  }
  return out.sort();
}

function jsDocOf(ts: TS, node: import("typescript").Node): { text: string; tags: Map<string, string> } {
  const docs = (node as unknown as { jsDoc?: import("typescript").JSDoc[] }).jsDoc ?? [];
  const last = docs[docs.length - 1];
  const tags = new Map<string, string>();
  if (!last) return { text: "", tags };
  for (const tag of last.tags ?? []) tags.set(tag.tagName.text, squash(ts.getTextOfJSDocComment(tag.comment) ?? ""));
  return { text: squash(ts.getTextOfJSDocComment(last.comment) ?? ""), tags };
}

/** Read one component's docs out of a directory of `.tsx` sources or `.d.ts` declarations. */
export function readComponents(ts: TS, sourceDir: string, names: readonly string[]): Map<string, ComponentDoc> {
  const out = new Map<string, ComponentDoc>();
  for (const file of listFiles(sourceDir)) {
    const text = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const interfaces = new Map<string, import("typescript").InterfaceDeclaration>();
    for (const st of sf.statements) if (ts.isInterfaceDeclaration(st)) interfaces.set(st.name.text, st);
    for (const st of sf.statements) {
      if (!ts.isFunctionDeclaration(st) || !st.name || !names.includes(st.name.text)) continue;
      const doc = jsDocOf(ts, st);
      const param = st.parameters[0];
      const typeNode = param?.type;
      const typeName = typeNode && ts.isTypeReferenceNode(typeNode) ? typeNode.typeName.getText(sf) : null;
      const iface = typeName ? interfaces.get(typeName) : undefined;
      if (!iface) {
        out.set(st.name.text, { name: st.name.text, summary: doc.text, use: doc.tags.get("use") ?? "", avoid: doc.tags.get("avoid") ?? "", props: null });
        continue;
      }
      const props: PropDoc[] = [];
      for (const m of iface.members) {
        if (!ts.isPropertySignature(m) || !m.type) continue;
        props.push({ name: m.name.getText(sf), optional: m.questionToken !== undefined, type: squash(m.type.getText(sf)) });
      }
      out.set(st.name.text, { name: st.name.text, summary: doc.text, use: doc.tags.get("use") ?? "", avoid: doc.tags.get("avoid") ?? "", props });
    }
  }
  return out;
}

const FAMILIES = ["color-role-", "type-family-", "type-scale-", "type-weight-", "type-leading-", "space-scale-", "space-radius-", "space-border-", "space-focus-", "motion-duration-", "motion-easing-"];

/** `--dk-color-role-accent`, `--dk-color-role-text` -> `color-role-{accent,text}`. */
export function groupTokens(names: readonly string[]): string {
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const bare = n.replace(/^--dk-/, "");
    const fam = FAMILIES.find((f) => bare.startsWith(f)) ?? "";
    const list = groups.get(fam) ?? [];
    list.push(bare.slice(fam.length));
    groups.set(fam, list);
  }
  return [...groups.entries()].map(([fam, rest]) => (fam === "" ? rest.join(",") : `${fam}{${rest.join(",")}}`)).join(" ");
}

function entryText(e: KitEntry, doc: ComponentDoc | undefined): string {
  const name = e.def.name;
  const variants = Object.entries(e.def.props).map(([axis, vs]) => `${axis}=${vs.join("|")}`);
  const lines = [`### ${name}`];
  if (!doc) {
    lines.push(`(no source found for ${name}; cannot read its props)`);
  } else {
    if (doc.summary) lines.push(doc.summary);
    if (doc.use) lines.push(`Use: ${doc.use}`);
    if (doc.avoid) lines.push(`Avoid: ${doc.avoid}`);
    if (doc.props === null) lines.push(`(props type of ${name} is not an interface in its file; cannot read its props)`);
    else lines.push(`Props: ${doc.props.map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`).join("; ")}`);
  }
  lines.push(`Variants: ${variants.length ? variants.join("; ") : "none"}`);
  lines.push(`States: ${e.def.states.join(", ")}`);
  lines.push(`Tokens: ${groupTokens(tokensOf(e))}`);
  return lines.join("\n");
}

export interface IndexInput {
  /** A directory of the kit's `.tsx` sources or its `.d.ts` declarations. */
  sourceDir: string;
  entries: readonly KitEntry[];
  typescript: TS;
}

/** The index body (without the markers). Pure and deterministic: regenerating yields identical bytes. */
export function generateIndex(input: IndexInput): string {
  const docs = readComponents(input.typescript, input.sourceDir, input.entries.map((e) => e.def.name));
  const head = [
    "## Component index (generated)",
    "Generated by `design-kit index` from the kit's types, data and JSDoc; do not edit between the markers. Import from `@qontinui/design-kit`.",
    "Components read only `var(--dk-*)`; compose them, do not restyle them. A state not listed is not supported.",
  ].join("\n");
  return [head, ...input.entries.map((e) => entryText(e, docs.get(e.def.name)))].join("\n\n") + "\n";
}

/** The marked block as it sits in a file. */
export const wrap = (body: string): string => `${MARK_START}\n${body}${MARK_END}`;

export type IndexState = "current" | "drift" | "missing-markers";

function span(file: string): { start: number; end: number } | null {
  const s = file.indexOf(MARK_START);
  const e = file.indexOf(MARK_END);
  if (s === -1 || e === -1 || e < s) return null;
  return { start: s, end: e + MARK_END.length };
}

/** Replace the block between the markers, or append one when the file has none. */
export function applyIndex(file: string, body: string): string {
  const sp = span(file);
  if (!sp) return (file.length && !file.endsWith("\n") ? file + "\n" : file) + (file.length ? "\n" : "") + wrap(body) + "\n";
  return file.slice(0, sp.start) + wrap(body) + file.slice(sp.end);
}

export function checkIndex(file: string, body: string): IndexState {
  const sp = span(file);
  if (!sp) return "missing-markers";
  return file.slice(sp.start, sp.end) === wrap(body) ? "current" : "drift";
}
