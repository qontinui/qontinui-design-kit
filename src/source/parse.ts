import { modularScale, spacingMultiple } from "../craft/arithmetic.js";
import {
  GROUPS,
  IDENTITY_CLAUSE,
  IMPORT_GROUPS,
  SourceError,
  VALUE_TYPES,
  isIdentityPath,
  type DeriveSpec,
  type DesignSource,
  type GroupName,
  type ImportGroup,
  type ImportSpec,
  type Leaf,
  type Source,
  type ValueType,
} from "./schema.js";
import { aliasTarget } from "./value.js";

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const SOURCE_RE = /^(?:(declared|undeclared)|(resolved|authored|derived)(?:\(([^()]*)\))?)$/;

/** Parse a leaf's `source` string. Returns null when it is not one of the five arms. */
export function parseSourceString(s: unknown): Source | null {
  if (typeof s !== "string") return null;
  const m = SOURCE_RE.exec(s.trim());
  if (!m) return null;
  if (m[1]) return { kind: m[1] as Source["kind"], arg: null };
  const arg = m[3] === undefined || m[3].trim() === "" ? null : m[3].trim();
  return { kind: m[2] as Source["kind"], arg };
}

function parseImports(raw: unknown, problems: string[]): ImportSpec[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push(`$extensions.qontinui.import must be an array`);
    return [];
  }
  const out: ImportSpec[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      out.push({ package: entry, ref: null, groups: null });
    } else if (isObject(entry) && typeof entry["package"] === "string") {
      let groups: ImportGroup[] | null = null;
      if (entry["groups"] !== undefined) {
        const g = entry["groups"];
        if (!Array.isArray(g) || g.some((x) => !(IMPORT_GROUPS as readonly string[]).includes(x as string))) {
          problems.push(`import ${entry["package"]}: groups must be a subset of ${IMPORT_GROUPS.join(", ")}`);
        } else {
          groups = g as ImportGroup[];
        }
      }
      out.push({
        package: entry["package"],
        ref: typeof entry["ref"] === "string" ? entry["ref"] : null,
        groups,
      });
    } else {
      problems.push(`import entries are a package name or { package, ref?, groups? }`);
    }
  }
  return out;
}

function parseDerive(path: string, raw: unknown, problems: string[]): DeriveSpec | null {
  if (!isObject(raw)) {
    problems.push(`leaf ${path}: source derived(...) needs $extensions.qontinui.derive`);
    return null;
  }
  const num = (k: string): number | null => (typeof raw[k] === "number" ? (raw[k] as number) : null);
  const unit = typeof raw["unit"] === "string" ? raw["unit"] : "px";
  if (raw["rule"] === "modular-scale") {
    const from = num("from");
    const ratio = num("ratio");
    const step = num("step");
    if (from === null || ratio === null || step === null) {
      problems.push(`leaf ${path}: modular-scale needs numeric from, ratio and step`);
      return null;
    }
    return { rule: "modular-scale", from, ratio, step, unit };
  }
  if (raw["rule"] === "spacing-multiple") {
    const base = num("base");
    const multiple = num("multiple");
    if (base === null || multiple === null) {
      problems.push(`leaf ${path}: spacing-multiple needs numeric base and multiple`);
      return null;
    }
    return { rule: "spacing-multiple", base, multiple, unit };
  }
  problems.push(`leaf ${path}: unknown derive rule ${JSON.stringify(raw["rule"])}`);
  return null;
}

function deriveValue(d: DeriveSpec): { value: number; unit: string } {
  return d.rule === "modular-scale"
    ? { value: modularScale(d.from, d.ratio, d.step), unit: d.unit }
    : { value: spacingMultiple(d.base, d.multiple), unit: d.unit };
}

function walk(
  node: Json,
  prefix: string[],
  group: GroupName,
  inheritedType: ValueType | null,
  leaves: Leaf[],
  problems: string[],
): void {
  let groupType = inheritedType;
  if (typeof node["$type"] === "string") groupType = node["$type"] as ValueType;
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    const path = [...prefix, key];
    const dotted = path.join(".");
    if (key.includes(".")) {
      problems.push(`${dotted}: a key may not contain "."`);
      continue;
    }
    if (!isObject(child)) {
      problems.push(`${dotted}: expected an object (a group or a leaf)`);
      continue;
    }
    const ext = isObject(child["$extensions"]) && isObject(child["$extensions"]["qontinui"]) ? (child["$extensions"]["qontinui"] as Json) : null;
    const isLeaf = "$value" in child || (ext !== null && "source" in ext);
    if (!isLeaf) {
      walk(child, path, group, groupType, leaves, problems);
      continue;
    }

    const source = parseSourceString(ext?.["source"]);
    if (!source) {
      const what = ext?.["source"] === undefined ? "has no source" : `has an invalid source ${JSON.stringify(ext["source"])}`;
      problems.push(`leaf ${dotted}: ${what}; use declared | authored(...) | derived(...) | undeclared (resolved comes from an import)`);
      continue;
    }
    const type = (typeof child["$type"] === "string" ? child["$type"] : groupType) as ValueType | null;
    if (type !== null && !(VALUE_TYPES as readonly string[]).includes(type)) {
      problems.push(`leaf ${dotted}: unknown $type ${JSON.stringify(type)}`);
      continue;
    }
    const hasValue = "$value" in child;
    let value: unknown = hasValue ? child["$value"] : null;
    let derive: DeriveSpec | null = null;
    let inputs: Record<string, unknown> | null = null;

    switch (source.kind) {
      case "undeclared":
        if (hasValue) problems.push(`leaf ${dotted}: an undeclared leaf carries no $value (the compiler never substitutes a default)`);
        break;
      case "resolved":
        problems.push(
          `leaf ${dotted}: a source file cannot state resolved(...) itself; import the package ("import": ["<package>"]) and the adapter labels what it reads`,
        );
        break;
      case "declared":
      case "authored":
        if (!hasValue) problems.push(`leaf ${dotted}: ${source.kind} leaf has no $value`);
        break;
      case "derived":
        if (hasValue) problems.push(`leaf ${dotted}: a derived leaf states its rule, not a $value`);
        if (type !== "dimension") problems.push(`leaf ${dotted}: a derived leaf must be a dimension`);
        derive = parseDerive(dotted, ext?.["derive"], problems);
        if (derive) {
          value = deriveValue(derive);
          inputs = { ...derive };
        }
        break;
    }

    // An undeclared leaf may say why it is unknown; the compile report lists the reason.
    const reason = ext?.["reason"];
    if (reason !== undefined) {
      if (source.kind !== "undeclared") {
        problems.push(`leaf ${dotted}: reason is carried only by an undeclared leaf (it says why the value is unknown); this leaf is ${source.kind}`);
      } else if (typeof reason !== "string" || reason.trim() === "") {
        problems.push(`leaf ${dotted}: reason must be a non-empty string`);
      } else {
        inputs = { reason: reason.trim() };
      }
    }

    if (source.kind === "authored" && isIdentityPath(dotted)) {
      problems.push(
        `leaf ${dotted}: refused. It is an identity value (a hue or chroma anchor, a type family or an imagery style) and cannot be authored(...). ` +
          `Identity values are declared by the owner or resolved from the tenant's package, never agent-authored [policy: ${IDENTITY_CLAUSE}]. ` +
          `Leave it undeclared, declare it, or import it.`,
      );
    }
    if (hasValue && type === null && aliasTarget(value) === null) problems.push(`leaf ${dotted}: a $value needs a $type (set it on the leaf or an enclosing group)`);

    const bound = ext?.["bound"];
    if (bound !== undefined && bound !== "max" && bound !== "min" && bound !== "none") {
      problems.push(`leaf ${dotted}: bound must be "max", "min" or "none"`);
    }
    leaves.push({
      path: dotted,
      group,
      type,
      value,
      source,
      derive,
      inputs,
      ...(bound === "max" || bound === "min" || bound === "none" ? { bound } : {}),
    });
  }
}

/** Validate and normalise a design-language source. Throws `SourceError` listing every problem. */
export function parseSource(raw: unknown): DesignSource {
  const problems: string[] = [];
  if (!isObject(raw)) throw new SourceError(["the source must be a JSON object"]);

  const qExt = isObject(raw["$extensions"]) && isObject(raw["$extensions"]["qontinui"]) ? (raw["$extensions"]["qontinui"] as Json) : {};
  const name = typeof qExt["name"] === "string" ? qExt["name"] : "design";
  const imports = parseImports(qExt["import"], problems);

  const pairs: [string, string][] = [];
  const craft = isObject(qExt["craft"]) ? qExt["craft"] : {};
  if (craft["contrastPairs"] !== undefined) {
    const cp = craft["contrastPairs"];
    if (!Array.isArray(cp) || cp.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((x) => typeof x !== "string"))) {
      problems.push(`craft.contrastPairs must be an array of [foreground path, ground path]`);
    } else {
      pairs.push(...(cp as [string, string][]));
    }
  }

  const leaves: Leaf[] = [];
  for (const [key, node] of Object.entries(raw)) {
    if (key.startsWith("$")) continue;
    if (!(GROUPS as readonly string[]).includes(key)) {
      problems.push(`unknown group ${JSON.stringify(key)}; the groups are ${GROUPS.join(", ")}`);
      continue;
    }
    if (!isObject(node)) {
      problems.push(`${key}: expected an object`);
      continue;
    }
    walk(node, [key], key as GroupName, null, leaves, problems);
  }

  const seen = new Set<string>();
  for (const l of leaves) {
    if (seen.has(l.path)) problems.push(`duplicate leaf ${l.path}`);
    seen.add(l.path);
  }

  if (problems.length > 0) throw new SourceError(problems);
  return { name, imports, craft: { contrastPairs: pairs }, leaves };
}
