const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(),'winelio-feed-db-'));
const bin = process.env.PG_BIN || '/opt/homebrew/opt/postgresql@16/bin';
function run(name,args) {
 const result = spawnSync(path.join(bin,name),args,{encoding:'utf8'});
 if(result.status!==0) throw new Error(result.stderr || result.stdout);
 return result.stdout + result.stderr;
}
try {
 run('initdb',['-D',path.join(root,'data'),'-A','trust','--no-locale']);
 run('pg_ctl',['-D',path.join(root,'data'),'-l',path.join(root,'server.log'),'-o',`-k ${root} -p 55439 -h ''`,'-w','start']);
 console.log(run('psql',['-h',root,'-p','55439','-d','postgres','-v','ON_ERROR_STOP=1','-f','tests/integration/national-feed.sql']));
} finally {
 spawnSync(path.join(bin,'pg_ctl'),['-D',path.join(root,'data'),'-m','immediate','-w','stop']);
 fs.rmSync(root,{recursive:true,force:true});
}
