// Fixtures: a temp project holding a design-language source.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./helpers.js";

export const SHA = "415be4535ac4deae2201ed4601084b4a948eef10";
export const SHORT = "415be45";

/** A leaf as the source format spells it. */
export const leaf = (type, value, source) => ({
  $type: type,
  ...(value === undefined ? {} : { $value: value }),
  $extensions: { qontinui: { source } },
});

export function mkProject(source, { name = "project" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dk-${name}-`));
  fs.mkdirSync(path.join(dir, "design"), { recursive: true });
  fs.writeFileSync(path.join(dir, "design", "language.dtcg.json"), JSON.stringify(source, null, 2));
  return {
    dir,
    sourcePath: path.join(dir, "design", "language.dtcg.json"),
    outDir: path.join(dir, "src", "design"),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** Where the token package is cloned from: the CI checkout, the sibling checkout, or GitHub. */
export function tokensRepo() {
  if (process.env.DESIGN_TOKENS_REPO) return process.env.DESIGN_TOKENS_REPO;
  const sibling = path.resolve(ROOT, "..", "qontinui-design-tokens");
  return fs.existsSync(path.join(sibling, ".git")) ? sibling : "https://github.com/qontinui/qontinui-design-tokens.git";
}

/** A cache the built token package survives in across test runs (gitignored). */
export const CACHE_DIR = path.join(ROOT, ".dk-cache");
