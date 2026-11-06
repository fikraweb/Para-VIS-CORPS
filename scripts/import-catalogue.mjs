import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const options=process.argv.slice(2),remote=options.includes('--remote');
if(!remote&&!options.includes('--local'))throw Error('Use --local or --remote explicitly.');
const args=[remote?'--remote':'--local'];
const persist=options.indexOf('--persist-to');if(persist>=0){if(remote||!options[persist+1])throw Error('Invalid persistence directory');args.push('--persist-to',options[persist+1]);}
const manifest=JSON.parse(readFileSync('catalogue-manifest.json','utf8'));
const files=readdirSync('catalogue-import').filter(n=>n.endsWith('.sql')).sort();
const hash=createHash('sha256');for(const file of files)hash.update(readFileSync('catalogue-import/'+file));const snapshot=hash.digest('hex');
function run(extra,json=false){const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','para-vis-corps',...args,...extra],{encoding:'utf8',stdio:json?'pipe':'inherit',maxBuffer:10*1024*1024});if(result.status!==0){if(json)process.stderr.write(result.stderr||'');throw Error('D1 catalogue operation failed; deployment stopped.');}if(json)return JSON.parse(result.stdout);}
function query(sql){return run(['--command',sql,'--json'],true)[0].results[0];}
function counts(){return query(`SELECT (SELECT COUNT(*) FROM products WHERE source_variant_id IS NOT NULL) AS formats,(SELECT COUNT(DISTINCT source_product_id) FROM products WHERE source_product_id IS NOT NULL) AS parents,(SELECT COUNT(*) FROM collections) AS collections,(SELECT COUNT(*) FROM product_collections) AS relationships`);}
function complete(c){return c.formats===manifest.sellable_formats&&c.parents===manifest.source_products&&c.collections===manifest.collections&&c.relationships===manifest.relationships;}
const previous=query(`SELECT COUNT(*) AS n FROM catalogue_imports WHERE snapshot='${snapshot}'`);
if(previous.n){console.log('Catalogue snapshot already imported. Existing stocks and edits preserved.');process.exit(0);}
if(!complete(counts())){
 for(const file of files){console.log('Importing '+file+' using the D1 SQL file importer');run(['--file','catalogue-import/'+file]);}
}
const result=counts();if(!complete(result))throw Error('Incomplete catalogue import: '+JSON.stringify(result));
run(['--command',`INSERT OR IGNORE INTO catalogue_imports(snapshot) VALUES ('${snapshot}')`]);
console.log('Catalogue verified: '+JSON.stringify(result)+'. Existing products, orders and edits preserved.');
