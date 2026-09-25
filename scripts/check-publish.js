const fs=require('fs'),cp=require('child_process');
const files=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(f=>f&&/\.(js|py|html|css|md|txt|bat|ps1|ya?ml|json)$/.test(f));
let count=0;
for(const file of files){if(!fs.existsSync(file))continue;const lines=fs.readFileSync(file,'utf8').split('\n');lines.forEach((line,i)=>{if(/(?:sk-[a-zA-Z0-9]{24,}|gh[pousr]_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{40,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)/.test(line)){console.log(file+':'+(i+1)+' potential credential');count++}})}
console.log(JSON.stringify({files:files.length,potentialCredentials:count}));process.exitCode=count?1:0;
