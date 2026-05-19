// Local-only link cho @launchtic/elements.

// Toggle qua: `pnpm elements:link` / `pnpm elements:unlink`

const fs = require("node:fs");
const path = require("node:path");

const MARKER = ".elements-linked";
const LINK_TARGETS = ["@launchtic/web", "@launchtic/renderer"];
const LINK_PATH = "link:../../../launchtic-elements";

function readPackage(pkg, context) {
  if (!LINK_TARGETS.includes(pkg.name)) return pkg;

  const marker = path.join(context.rootDir ?? context.lockfileDir ?? ".", MARKER);
  if (!fs.existsSync(marker)) return pkg;

  if (pkg.dependencies?.["@launchtic/elements"]) {
    pkg.dependencies["@launchtic/elements"] = LINK_PATH;
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
