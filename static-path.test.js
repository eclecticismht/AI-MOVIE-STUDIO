const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{resolveStatic}=require('./static-path');
test('static routes reject encoded private paths, traversal and malformed escapes',()=>{
 const root=path.resolve('workspace');assert.equal(resolveStatic(root,'/'),path.join(root,'AI_MOVIE_STUDIO.html'));assert.equal(resolveStatic(root,'/assets/image.png'),path.join(root,'assets/image.png'));
 for(const input of ['/%ZZ','/.env','/%2eenv','/a/../secret','/a\\..\\secret','/.runtime/config.json','/a.key','/%00'])assert.throws(()=>resolveStatic(root,input));
});
