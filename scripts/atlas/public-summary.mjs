// Run offline against an approved manifest. Only the aggregate JSON goes to the atlas.
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSummary} from '../../atlas/public-summary-core.mjs';

export {buildSummary};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 const manifestPath = resolve(process.argv[2]);
 const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
 const result = await buildSummary(manifest, async entry => JSON.parse(await readFile(resolve(dirname(manifestPath),entry.file),'utf8')));
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
