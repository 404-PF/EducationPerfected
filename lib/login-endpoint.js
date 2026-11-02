// Production endpoint protection. Runtime overrides remain TEST_BOOT-only.
function loginEndpoint(testBoot, env) {
 return {
  url: (testBoot && env.EP_LOGIN_URL) || 'https://app.educationperfect.com/app/login',
  host: (testBoot && env.EP_LOGIN_HOST) || 'iam.educationperfect.com',
 };
}
module.exports = {loginEndpoint};
