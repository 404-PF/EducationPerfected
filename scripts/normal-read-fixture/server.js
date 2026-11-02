// Loopback-only exact synthetic POST observation. No native store or browser APIs.
const http=require('node:http');
function createVerifier(expected) {
 if(typeof expected?.email!=='string'||!expected.email||typeof expected.password!=='string'||!expected.password)throw Error('Fixture pair unavailable');
 let attempts=0,matched=false;
 const server=http.createServer((req,res)=>{
  const send=(status,body,type='text/html')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);};
  if(req.headers.host!=='127.0.0.1:43187'||req.socket.remoteAddress!=='127.0.0.1')return send(400,'Rejected');
  if(req.method==='GET'&&req.url==='/app/login')return send(200,`<!doctype html><form method="POST" action="/verify"><input id="loginId" name="email"><input id="password" name="password" type="password"><button type="submit">Log in</button></form>`);
  if(req.method==='POST'&&req.url==='/verify'){
   if(req.headers['content-type']!=='application/x-www-form-urlencoded')return send(415,'Rejected');
   let body='',size=0,invalid=false;
   req.on('data',chunk=>{size+=chunk.length;if(size>4096){invalid=true;body='';}else if(!invalid)body+=chunk.toString('utf8');});
   req.on('end',()=>{
    attempts++;const fields=new URLSearchParams(body),keys=[...fields.keys()];
    const good=!invalid&&attempts===1&&keys.length===2&&keys.filter(x=>x==='email').length===1&&keys.filter(x=>x==='password').length===1&&fields.get('email')===expected.email&&fields.get('password')===expected.password;
    body='';if(!good)return send(403,'Rejected');matched=true;res.writeHead(303,{Location:'/learning/dashboard','Cache-Control':'no-store'});res.end();
   });return;
  }
  if(req.method==='GET'&&req.url==='/learning/dashboard'&&matched)return send(200,'<main><div id="single-spa-application:mfeGlobalNavigation:Tertiary">Home</div></main>');
  send(404,'Rejected');
 });
 return Object.freeze({listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(43187,'127.0.0.1',()=>{const a=server.address();if(a.address!=='127.0.0.1'||a.port!==43187)return reject(Error('Wrong fixture binding'));resolve();});}),close:()=>new Promise(resolve=>server.close(resolve)),observation:()=>Object.freeze({attempts,matched})});
}
module.exports={createVerifier};
