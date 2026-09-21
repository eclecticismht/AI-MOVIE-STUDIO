// Decode after joining bytes: a network chunk may end in the middle of a Chinese character.
async function readUtf8(req,limit,message='请求过大'){
 const chunks=[];let bytes=0;
 for await(const value of req){const chunk=Buffer.isBuffer(value)?value:Buffer.from(value);bytes+=chunk.length;if(bytes>limit)throw Error(message);chunks.push(chunk);}
 return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
}
module.exports={readUtf8};
