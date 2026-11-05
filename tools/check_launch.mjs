import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export function checkLaunch(){
 const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const config=JSON.parse(read('config/launch.json')),v=config.privacyVersion;
 assert.equal(config.policyPublished,true);
 const policy=new URL(config.policyUrl);
 assert.equal(policy.href,'https://ivanzdaniekin.github.io/mypage/privacy/');
 assert.match(config.policyEffectiveDate,/^\d{4}-\d{2}-\d{2}$/);
 assert.ok(read('index.html').includes('href="'+policy.pathname+'"'));
 assert.match(read('assets/leads-config.js'),/enabled:\s*false/);assert.match(read('assets/leads-config.js'),/privacyApproved:\s*false/);
 assert.match(read('assets/leads-config.js'),new RegExp('privacyVersion: '+JSON.stringify(v).replaceAll('"',"'")));
 assert.ok(read('index.html').includes('data-privacy-version="'+v+'"'));
 assert.ok(read('backend/Code.gs').includes("MYPAGE_POLICY_VERSION='"+v+"'"));
 assert.equal(config.appsScriptProperties.MYPAGE_PRIVACY_VERSION,v);
 const production=read('backend/wrangler.production.toml');
 assert.ok(production.includes('invocation_logs = false'));
 assert.ok(production.includes('PRIVACY_VERSION = "'+v+'"'));
 for(const pair of ['ENABLED = "false"','PRIVACY_APPROVED = "false"','TEST_ONLY = "true"','D1_CLEANUP_ENABLED = "false"','RETENTION_BRIDGE_ENABLED = "false"','"0 3 * * *"','"0 * * * *"','ivan-praca-leads','7f133043-db01-46b5-8c65-30fe059c1edd'])assert.ok(production.includes(pair),pair);
 for(const [key,value] of Object.entries(config.appsScriptProperties))if(key!=='MYPAGE_PRIVACY_VERSION')assert.equal(value,'false');
 assert.ok(read('docs/PRIVACY-RU-PL.md').includes(v));assert.ok(!read('docs/PRIVACY-RU-PL.md').includes('[СОГЛАСОВАТЬ'));
 for(const page of ['index.html','vakansii/index.html','rabotodatelyam/index.html'])assert.ok(!/https:\/\/fonts\.(googleapis|gstatic)\.com/.test(read(page)));
 const fonts=read('assets/fonts.css');assert.ok(!/https?:/.test(fonts));
 for(const match of fonts.matchAll(/url\(([^)]+)\)/g))assert.ok(fs.existsSync(path.join(root,match[1].replace('/mypage/',''))));
 return {privacyVersion:v,preparedDate:config.preparedDate,publicIntake:false,destructiveMaintenance:false,cronInstalledByThisCheck:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(checkLaunch()));
