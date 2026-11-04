// Explicit owner-run installation only. Default mode performs NO cloud operations.
import {checkLaunch} from './check_launch.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const plan=[['d1','execute','ivan-praca-leads-db','--remote','--config','backend/wrangler.production.toml','--file','backend/schema.sql'],['deploy','--config','backend/wrangler.production.toml']];
checkLaunch();
if(process.argv.length===2){console.log(JSON.stringify({mode:'plan-only',appsScriptMustBeInstalledFirst:true,commands:plan,postInstall:'Verify deployed versions, closed flags and both Cron Triggers in Cloudflare; wait up to 15 minutes for propagation. Do not enable deletion or intake.'}));}
else if(process.argv.slice(2).join(' ')==='--allow-cloud-install --apps-script-installed'){
 for(const args of plan){const result=spawnSync('wrangler',args,{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
 console.log('Installed closed configuration. Verify cloud flags/schedules separately; no purge or application POST was requested by this script.');
}else{console.error('Use default plan-only mode. Cloud install requires separate owner approval and both explicit switches.');process.exitCode=1;}
