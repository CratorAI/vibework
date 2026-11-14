import fs from 'node:fs';
import path from 'node:path';
const version = JSON.parse(fs.readFileSync('package.json')).version;
const root = process.argv[2];
const repo = process.env.GITHUB_REPOSITORY || 'CratorAI/vibework';
const platforms = {};
for (const arch of ['aarch64', 'x86_64']) {
 const dir = path.join(root, arch);
 if (!fs.existsSync(dir)) continue;
 const files = fs.readdirSync(dir, {recursive:true}).filter(f => f.endsWith('.app.tar.gz'));
 if (files.length !== 1) throw Error(`Expected one updater bundle for ${arch}`);
 const input = path.join(dir, files[0]);
 const name = `Vibework_${version}_${arch}.app.tar.gz`;
 fs.copyFileSync(input, path.join(root, name));
 fs.copyFileSync(input+'.sig', path.join(root, name+'.sig'));
 platforms[`darwin-${arch}`] = {signature: fs.readFileSync(input+'.sig','utf8').trim(),url:`https://github.com/${repo}/releases/download/v${version}/${name}`};
}
if (!Object.keys(platforms).length) throw Error('No updater bundles');
fs.writeFileSync(path.join(root,'latest.json'), JSON.stringify({version,notes:fs.existsSync('RELEASE_NOTES.md')?fs.readFileSync('RELEASE_NOTES.md','utf8'):'See the GitHub release for notes.',pub_date:new Date().toISOString(),platforms},null,2));
