/**
 * 微信登录流程测试（mock wx / getApp，加载真实 pages/login/login.js）
 *
 * 覆盖两条路径：
 *   A. 登录页「微信一键登录」按钮 → wx.login → 后端换 JWT
 *   B. 手机浏览器点「微信登录」scheme 拉起小程序带 ticket 落地 → 自动登录
 *
 * 运行: node test/wechat-login-test.js
 */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOGIN_JS = path.join(ROOT, 'pages/login/login.js');
const API_JS = path.join(ROOT, 'utils/api.js');

// ─── mock 环境 ───
let storage = {};
let toasts = [];
let switchTabCalls = [];
let apiCalls = [];
let loginBehavior = 'ok'; // ok | nocode | fail
let apiBehavior = 'ok';   // ok | httpfail | notoken

const appStub = {
  globalData: { token: null, user: null, settings: { uiTheme: 'dark' } },
  setToken(t) { this.globalData.token = t; },
  saveUser(u) { this.globalData.user = u; },
};

global.getApp = () => appStub;
global.wx = {
  login(opts) {
    if (loginBehavior === 'nocode') return opts.success({ code: '' });
    if (loginBehavior === 'fail') return opts.fail({ errMsg: 'login:fail' });
    opts.success({ code: 'MOCK_CODE_123' });
  },
  showToast(o) { toasts.push(o); },
  switchTab(o) { switchTabCalls.push(o); },
  setStorageSync(k, v) { storage[k] = v; },
  getStorageSync(k) { return storage[k]; },
  removeStorageSync(k) { delete storage[k]; },
  request() { throw new Error('未预期的 wx.request（utils/api 应被 mock）'); },
};

// mock utils/api：只替换微信登录接口，其余保持原样
const realApi = require(API_JS);
realApi.wechatMiniAppLogin = (code, ticket) => {
  apiCalls.push({ code, ticket });
  if (apiBehavior === 'httpfail') return Promise.reject(new Error('网络错误'));
  if (apiBehavior === 'notoken') return Promise.resolve({ success: false, error: '微信授权验证失败，请重试' });
  return Promise.resolve({
    success: true,
    data: {
      userId: 42, username: 'wx_abc12345', token: 'JWT_TOKEN',
      role: 'user', avatarUrl: null, teacherStatus: 'none',
      membership: null, isNewUser: false,
    },
  });
};

// 捕获 Page 定义
let pageDef = null;
global.Page = (def) => { pageDef = def; };
require(LOGIN_JS);

// ─── 断言工具 ───
let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}
function section(title) {
  console.log('\n=== ' + title + ' ===');
}
function reset() {
  toasts = []; switchTabCalls = []; apiCalls = [];
  storage = {}; apiBehavior = 'ok'; loginBehavior = 'ok';
  appStub.globalData = { token: null, user: null, settings: { uiTheme: 'dark' } };
}
function makePage() {
  const inst = Object.create(pageDef);
  inst.data = JSON.parse(JSON.stringify(pageDef.data));
  inst.setData = function (patch) { Object.assign(this.data, patch); };
  return inst;
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  section('场景1：登录页点「微信一键登录」成功');
  reset();
  let p = makePage();
  p.onWeChatLogin();
  await wait(10);
  assert('调用了 wx.login 并上报 code', apiCalls.length === 1 && apiCalls[0].code === 'MOCK_CODE_123', JSON.stringify(apiCalls));
  assert('未携带 ticket', apiCalls[0] && apiCalls[0].ticket === undefined, JSON.stringify(apiCalls[0]));
  assert('token 已写入 app', appStub.globalData.token === 'JWT_TOKEN', String(appStub.globalData.token));
  assert('用户信息已保存', appStub.globalData.user && appStub.globalData.user.userId === 42);
  assert('跳转首页', switchTabCalls.length === 1 && switchTabCalls[0].url === '/pages/choice/choice', JSON.stringify(switchTabCalls));
  assert('无错误提示', p.data.error === '', p.data.error);
  assert('loading 已复位', p.data.loading === false);

  section('场景2：用户拒绝授权 / wx.login 失败');
  reset(); loginBehavior = 'fail';
  p = makePage();
  p.onWeChatLogin();
  await wait(10);
  assert('未调用后端接口', apiCalls.length === 0, JSON.stringify(apiCalls));
  assert('行内展示错误', p.data.error.includes('微信登录失败'), p.data.error);
  assert('未跳转', switchTabCalls.length === 0);
  assert('loading 已复位', p.data.loading === false);

  section('场景3：wx.login 返回空 code');
  reset(); loginBehavior = 'nocode';
  p = makePage();
  p.onWeChatLogin();
  await wait(10);
  assert('提示凭证获取失败', p.data.error.includes('获取微信登录凭证失败'), p.data.error);
  assert('未跳转', switchTabCalls.length === 0);

  section('场景4：后端返回业务错误（code 无效）');
  reset(); apiBehavior = 'notoken';
  p = makePage();
  p.onWeChatLogin();
  await wait(10);
  assert('透出后端错误信息', p.data.error === '微信授权验证失败，请重试', p.data.error);
  assert('未跳转', switchTabCalls.length === 0);
  assert('loading 已复位', p.data.loading === false);

  section('场景5：网络异常');
  reset(); apiBehavior = 'httpfail';
  p = makePage();
  p.onWeChatLogin();
  await wait(10);
  assert('提示网络错误', p.data.error === '网络错误', p.data.error);
  assert('loading 已复位', p.data.loading === false);

  section('场景6：scheme 拉起落地（带 ticket）成功');
  reset();
  p = makePage();
  p.onLoad({ ticket: 'deadbeef1234' });
  await wait(10);
  assert('ticket 已上报后端', apiCalls.length === 1 && apiCalls[0].ticket === 'deadbeef1234', JSON.stringify(apiCalls));
  assert('进入落地状态', p.data.wxLanding === true && p.data.wxTicket === 'deadbeef1234');
  assert('状态为 success', p.data.wxStatus === 'success', p.data.wxStatus);
  assert('token 已写入 app', appStub.globalData.token === 'JWT_TOKEN');
  await wait(1400);
  assert('约 1.2 秒后跳转首页', switchTabCalls.length === 1 && switchTabCalls[0].url === '/pages/choice/choice', JSON.stringify(switchTabCalls));

  section('场景7：scheme 落地 ticket 需 URL 解码');
  reset();
  p = makePage();
  p.onLoad({ ticket: 'abc%2B123' });
  await wait(10);
  assert('解码后的 ticket 上报', apiCalls[0] && apiCalls[0].ticket === 'abc+123', JSON.stringify(apiCalls));
  await wait(1400); // 等本场景的延迟跳转定时器结束，避免泄漏到下一场景

  section('场景8：scheme 落地失败后可重试');
  reset(); apiBehavior = 'notoken';
  p = makePage();
  p.onLoad({ ticket: 't999' });
  await wait(10);
  assert('落地状态为 error', p.data.wxStatus === 'error', p.data.wxStatus);
  assert('落地展示错误信息', !!p.data.wxMessage, p.data.wxMessage);
  assert('未跳转', switchTabCalls.length === 0);
  apiBehavior = 'ok';
  p.onWeChatRetry();
  await wait(10);
  assert('重试后成功', p.data.wxStatus === 'success', p.data.wxStatus);
  await wait(1400);
  assert('重试后跳转', switchTabCalls.length === 1, JSON.stringify(switchTabCalls));
  assert('重试携带原 ticket', apiCalls[1].ticket === 't999', JSON.stringify(apiCalls));

  section('场景9：无 ticket 进入登录页不触发自动登录');
  reset();
  p = makePage();
  p.onLoad({});
  p.onLoad(undefined);
  await wait(10);
  assert('未发起登录', apiCalls.length === 0, JSON.stringify(apiCalls));
  assert('不在落地状态', p.data.wxLanding === false);

  section('场景10：重复点击按钮互斥');
  reset();
  p = makePage();
  p.setData({ loading: true });
  p.onWeChatLogin();
  await wait(10);
  assert('loading 中忽略点击', apiCalls.length === 0, JSON.stringify(apiCalls));

  console.log(`\n结果: ${passed} 通过 / ${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
})();
