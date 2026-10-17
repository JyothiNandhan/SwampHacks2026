import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL('../'+path, import.meta.url),'utf8');
const versions=JSON.parse(read('config/technology-versions.json'));
const actual=process.version.slice(1);
if (actual!==versions.node) throw Error(`Expected Node ${versions.node}, found ${actual}`);
const root=JSON.parse(read('package.json'));
if(root.packageManager!==`pnpm@${versions.pnpm}`)throw Error('Wrong package manager version');
const ws=read('pnpm-workspace.yaml');
for(const [name,version] of Object.entries(versions.directDependencies)){
  const lines=ws.split('\n').map(s=>s.trim().replaceAll("'",'').replaceAll('"',''));
  if(!lines.includes(`${name}: ${version}`))throw Error(`Wrong catalog pin: ${name}@${version}`);
}
for (const folder of ['apps', 'packages']) {
  for (const entry of fs.readdirSync(new URL('../'+folder, import.meta.url), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = `${folder}/${entry.name}/package.json`;
    const pkg = JSON.parse(read(path));
    for (const [name, version] of Object.entries({...pkg.dependencies, ...pkg.devDependencies})) {
      if (version === 'catalog:' && versions.directDependencies[name]) continue;
      if (version === 'workspace:*' && name.startsWith('@moneyback/')) continue;
      throw Error(`${path}: invalid dependency ${name}=${version}`);
    }
  }
}
for (const name of ['.nvmrc', '.node-version']) {
  if (read(name).trim() !== versions.node) throw Error(`Runtime pin mismatch in ${name}`);
}
if (root.engines.node !== versions.node || root.engines.pnpm !== versions.pnpm) throw Error('Engine pin mismatch');
for (const forbidden of ['package-lock.json', 'yarn.lock']) {
  if (fs.existsSync(new URL('../'+forbidden, import.meta.url))) throw Error(`Forbidden lockfile: ${forbidden}`);
}
console.log('Version policy OK:',actual,root.packageManager);
