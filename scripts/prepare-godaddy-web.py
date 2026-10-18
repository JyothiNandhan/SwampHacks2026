"""Export the Next.js app as an independent npm project for GoDaddy."""
import json
from pathlib import Path
import re
import shutil
import sys

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1] if len(sys.argv) > 1 else root / "dist/godaddy-web")
if output.exists() and any(output.iterdir()):
    raise SystemExit("Output must be an empty directory; choose a fresh export path.")
output.mkdir(parents=True, exist_ok=True)
web = root / "apps/web"
catalog = {}
for line in (root / "pnpm-workspace.yaml").read_text().splitlines():
    match = re.fullmatch(r"  (?:'([^']+)'|([^:]+)): ([^ ]+)", line)
    if match:
        catalog[match[1] or match[2]] = match[3]

source_package = json.loads((web / "package.json").read_text())
dependencies = {
    name: catalog[name] if version == "catalog:" else version
    for name, version in source_package["dependencies"].items()
}
# GoDaddy installs production dependencies before building TypeScript source.
for name in ("typescript", "@types/node", "@types/react", "@types/react-dom"):
    dependencies[name] = catalog[name]
package = {
    "name": "moneyback-web", "version": source_package["version"],
    "private": True, "type": "module", "engines": {"node": "22.x"},
    "scripts": {
        "build": "next build", "start": "next start --hostname 0.0.0.0",
        "dev": "next dev --hostname 0.0.0.0",
    },
    "dependencies": dependencies,
}
lock_path = root / "deployment/godaddy/package-lock.json"
lock = json.loads(lock_path.read_text())
if lock["packages"][""]["dependencies"] != dependencies:
    raise SystemExit("Frontend dependencies changed: regenerate deployment/godaddy/package-lock.json.")
(output / "package.json").write_text(json.dumps(package, indent=2) + "\n")
shutil.copy2(lock_path, output / "package-lock.json")

def copy_source(source, destination):
    for path in source.rglob("*"):
        relative = path.relative_to(source)
        if any(part.startswith(".") or part == "node_modules" for part in relative.parts):
            continue
        if path.is_symlink():
            raise SystemExit(f"Refusing source symlink: {relative}")
        if path.is_file() and not re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", path.name):
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)

for directory in ("app", "components", "lib", "public"):
    if (web / directory).exists():
        copy_source(web / directory, output / directory)
shutil.copy2(web / "tsconfig.json", output / "tsconfig.json")
# next-env.d.ts is generated and ignored in the repository. Next creates it
# during build; exporting source must also work in a fresh CI checkout.
config = (web / "next.config.ts").read_text()
# This export uses next start, with tracing rooted in the exported app.
config = config.replace("output:'standalone',", "")
config = config.replace("path.resolve(import.meta.dirname,'../..')", "path.resolve(import.meta.dirname)")
(output / "next.config.ts").write_text(config)
(output / ".gitignore").write_text("node_modules/\n.next/\n.env\n.env.*\n*.tsbuildinfo\n")
print(f"Exported frontend to {output}; backend and credentials excluded.")
