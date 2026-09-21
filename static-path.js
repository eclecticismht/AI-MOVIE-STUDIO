const path=require('node:path');
function resolveStatic(root,pathname){
 let relative;try{relative=decodeURIComponent(pathname).replace(/^\/+/, '')}catch{throw Error('invalid path')}
 if(!relative)relative='AI_MOVIE_STUDIO.html';
 if(relative.includes('\0')||relative.split(/[\\/]/).some(p=>p.startsWith('.'))||/\.(?:env|pem|key|bat|ps1|log|toml)$/i.test(relative))throw Error('private path');
 const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('outside workspace');return file;
}
module.exports={resolveStatic};
