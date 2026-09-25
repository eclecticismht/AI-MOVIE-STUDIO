const test=require('node:test'),assert=require('node:assert/strict'),{requestError}=require('./local-request');
test('loopback services reject foreign and rebinding origins while allowing local UI and CLI',()=>{
 const options={port:8080,origins:['http://127.0.0.1:4173']};
 for(const headers of [{host:'127.0.0.1:8080',origin:'https://outside.example'},{host:'outside.example:8080',origin:'http://outside.example:8080'},{host:'127.0.0.1:8080','sec-fetch-site':'cross-site'}])assert.ok(requestError({headers},options));
 for(const headers of [{host:'127.0.0.1:8080'},{host:'127.0.0.1:8080',origin:'http://127.0.0.1:4173'}])assert.equal(requestError({headers},options),null);
});
