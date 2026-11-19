/**
 * `defineComponent`: a component's states are DATA, a closed list the
 * specimen, the state check and the generated index all read. A component with
 * a state outside the list, or none at all, cannot be defined.
 */
export const STATES = ["default", "hover", "focus-visible", "active", "disabled", "loading", "error", "selected"] as const;
export type State = (typeof STATES)[number];

/** The states a pseudo-class can force (hover, active) versus the ones the component reads from an attribute. */
export const FORCEABLE_STATES: readonly State[] = ["hover", "active"];

export interface ComponentDef<P extends Record<string, readonly string[]> = Record<string, readonly string[]>> {
  readonly name: string;
  /** Variant axes: prop name -> its allowed values. The specimen's variant cells are the `variant` axis. */
  readonly props: P;
  readonly states: readonly State[];
}

export function defineComponent<const P extends Record<string, readonly string[]>>(def: {
  name: string;
  props: P;
  states: readonly State[];
}): ComponentDef<P> {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(def.name)) throw new Error(`defineComponent: name ${JSON.stringify(def.name)} must be PascalCase`);
  if (def.states.length === 0) throw new Error(`defineComponent(${def.name}): states is empty`);
  const seen = new Set<string>();
  for (const s of def.states) {
    if (!(STATES as readonly string[]).includes(s)) {
      throw new Error(`defineComponent(${def.name}): state ${JSON.stringify(s)} is not in the closed list ${STATES.join(" | ")}`);
    }
    if (seen.has(s)) throw new Error(`defineComponent(${def.name}): state ${s} is listed twice`);
    seen.add(s);
  }
  if (!seen.has("default")) throw new Error(`defineComponent(${def.name}): states must include "default"`);
  for (const [axis, values] of Object.entries(def.props)) {
    if (values.length === 0) throw new Error(`defineComponent(${def.name}): variant axis ${axis} has no values`);
  }
  return Object.freeze({ name: def.name, props: def.props, states: Object.freeze([...def.states]) });
}

/** The values of a component's `variant` axis, or `["default"]` when it has none. */
export function variantsOf(def: ComponentDef): readonly string[] {
  return def.props["variant"] ?? ["default"];
}
