// Validation-only build-time substitute. Never selected by a runtime flag.
function loginEndpoint(testBoot, env) {
 if (testBoot || ['EP_TEST_BOOT','EP_EMAIL','EP_PASSWORD','EP_LOGIN_URL','EP_LOGIN_HOST'].some(key=>Object.hasOwn(env,key))) throw Error('Fixture environment refused');
 return {url:'http://127.0.0.1:43187/app/login',host:'127.0.0.1'};
}
module.exports={loginEndpoint};
