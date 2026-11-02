// Inert contract and loopback HTTP tests. No credential/native/browser APIs.
const assert=require('node:assert/strict'),http=require('node:http');
const prod=require('../../lib/login-endpoint'),fixture=require('./endpoint'),{createVerifier}=require('./server'),{requireProof}=require('./proof');
const pair={email:['synthetic','example.test'].join('@'),password:['fixture','inert'].join('-')};
const env={EP_LOGIN_URL:'http://untrusted.invalid',EP_LOGIN_HOST:'untrusted.invalid'};
assert.deepEqual(prod.loginEndpoint(false,env),{url:'https://app.educationperfect.com/app/login',host:'iam.educationperfect.com'});
assert.deepEqual(prod.loginEndpoint(true,env),{url:env.EP_LOGIN_URL,host:env.EP_LOGIN_HOST});
assert.deepEqual(fixture.loginEndpoint(false,{}),{url:'http://127.0.0.1:43187/app/login',host:'127.0.0.1'});
for(const key of ['EP_TEST_BOOT','EP_EMAIL','EP_PASSWORD','EP_LOGIN_URL','EP_LOGIN_HOST'])for(const value of ['','1'])assert.throws(()=>fixture.loginEndpoint(false,{[key]:value}));
assert.throws(()=>fixture.loginEndpoint(true,{}));
const proof={env:{},observation:{attempts:1,matched:true},output:'Auto-login credentials loaded from the OS credential store.\nCommands: start',artifactKind:'MODIFIED-VALIDATION-ONLY'};
assert.equal(requireProof(proof),true);
for(const change of [{stdinIsTTY:true},{controllerUsed:true},{promptUsed:true},{artifactKind:'UNCHANGED'},{env:{EP_TEST_BOOT:''}},{env:{EP_EMAIL:''}},{observation:{attempts:0,matched:false}},{observation:{attempts:2,matched:true}},{output:'Commands: start'}])assert.throws(()=>requireProof({...proof,...change}));
function request(method,url,body,headers={}){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:43187,method,path:url,headers:{...headers}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,body:data,location:res.headers.location}));});req.on('error',reject);req.end(body);});}
(async()=>{
 for(const scenario of ['exact','wrong','duplicate','oversize','content-type','host']){
  const v=createVerifier(pair);assert.equal(Object.isFrozen(v),true);assert.equal(Object.hasOwn(v,'server'),false);assert.equal(Object.isFrozen(v.observation()),true);await v.listen();
  try {
   const form=await request('GET','/app/login');assert.equal(form.status,200);assert.ok(form.body.includes('id="loginId"')&&form.body.includes('id="password"')&&form.body.includes('method="POST"'));
   assert.equal((await request('GET','/learning/dashboard')).status,404);
   let body=new URLSearchParams(pair).toString();const headers={'Content-Type':'application/x-www-form-urlencoded'};
   if(scenario==='wrong')body=new URLSearchParams({...pair,password:'wrong'}).toString();
   if(scenario==='duplicate')body+='&email=other';if(scenario==='oversize')body+='x'.repeat(4097);if(scenario==='content-type')headers['Content-Type']='application/json';if(scenario==='host')headers.Host='wrong.invalid';
   const result=await request('POST','/verify',body,headers);assert.equal(result.status,scenario==='exact'?303:scenario==='content-type'?415:scenario==='host'?400:403);
   assert.ok(!result.body.includes(pair.email)&&!result.body.includes(pair.password));
   assert.equal(v.observation().matched,scenario==='exact');
   assert.equal((await request('GET','/learning/dashboard')).status,scenario==='exact'?200:404);
   if(scenario==='exact'){assert.equal((await request('POST','/verify',body,headers)).status,403);assert.equal(v.observation().attempts,2);}
  }finally{await v.close();}
 }
 console.log('Inert endpoint protection, fixture environment/admission negatives and exact loopback POST observation passed. No native/browser/normal-path runtime proof. Controller/prompt metadata requires independent run provenance.');
})().catch(()=>{console.error('Fixture contract failed.');process.exitCode=1;});
