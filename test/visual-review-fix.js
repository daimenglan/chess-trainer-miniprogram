/**
 * 一次性视觉校验：未登录访客页 + 登录页（含返回/取消按钮）
 * 运行: node test/visual-review-fix.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const WEB_ROOT = path.join(ROOT, '..', '国际象棋陪练');
const { chromium } = require(path.join(WEB_ROOT, 'node_modules', 'playwright'));

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const rpxToPx = (css) => css.replace(/([\d.]+)rpx/g, (_, n) => (parseFloat(n) / 2) + 'px');

const appWxss = rpxToPx(read('app.wxss'));
const profileWxss = rpxToPx(read('pages/profile/profile.wxss'));
const loginWxss = rpxToPx(read('pages/login/login.wxss'));

const guestHtml = `
<view class="shell-page theme-dark">
  <view class="guest-page">
    <view class="guest-header">
      <text class="guest-logo">♟ Mychess</text>
      <text class="guest-title">登录后解锁更多功能</text>
      <text class="guest-desc">登录可同步对弈记录、棋谱分析、训练计划与会员权益</text>
    </view>
    <view class="guest-benefits">
      <view class="guest-benefit"><text class="guest-benefit-icon">📊</text><text>个人棋力分析报告</text></view>
      <view class="guest-benefit"><text class="guest-benefit-icon">📁</text><text>云端棋谱与对局记录</text></view>
      <view class="guest-benefit"><text class="guest-benefit-icon">🎯</text><text>专属训练计划</text></view>
      <view class="guest-benefit"><text class="guest-benefit-icon">🏆</text><text>每日挑战与龙币奖励</text></view>
    </view>
    <view class="guest-actions">
      <view class="guest-login-btn"><text class="guest-wechat-icon">微</text><text>微信一键登录</text></view>
      <view class="guest-browse-btn"><text>暂不登录，先逛逛</text></view>
    </view>
    <text class="guest-hint">未登录也可浏览首页、体验 AI 陪练与习题</text>
  </view>
</view>`;

const loginHtml = `
<view class="login-page theme-dark">
  <view class="login-back-bar">
    <view class="login-back-btn"><text class="login-back-icon">←</text><text>返回</text></view>
  </view>
  <view class="login-card glass-strong">
    <view class="login-header">
      <text class="logo-text">Mychess</text>
      <text class="logo-sub">国际象棋陪练</text>
    </view>
    <view class="form">
      <view class="form-header">
        <text class="form-header-title">🔑 微信登录</text>
        <text class="form-header-desc">点击下方按钮使用微信授权登录，未注册的手机号将自动创建账号</text>
      </view>
      <view class="error-msg">请先勾选并同意《用户服务协议》和《隐私政策》</view>
      <view class="wechat-login-btn">
        <view class="wechat-icon"><text class="wechat-icon-text">微</text></view>
        <text>微信一键登录</text>
      </view>
      <view class="cancel-login-btn"><text>暂不登录，先逛逛</text></view>
    </view>
    <view class="agreement-row">
      <view class="agreement-checkbox"></view>
      <view class="agreement-text"><text>我已阅读并同意</text><text class="agreement-link">《用户服务协议》</text><text>和</text><text class="agreement-link">《隐私政策》</text></view>
    </view>
  </view>
  <view class="ai-disclaimer"><text>本服务为AI生成、人工智能生成内容，结果仅供参考</text></view>
</view>`;

function page(body, css) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#0f0f23;font-family:-apple-system,"PingFang SC",sans-serif;color:#e8e8f0;}
  view,text{display:block;}
  ${appWxss}
  ${css}
</style></head><body>${body}</body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();

  await p.setContent(page(guestHtml, profileWxss), { waitUntil: 'load' });
  await p.screenshot({ path: path.join(ROOT, 'test/screenshots/review-guest.png') });

  await p.setContent(page(loginHtml, loginWxss), { waitUntil: 'load' });
  await p.screenshot({ path: path.join(ROOT, 'test/screenshots/review-login.png') });

  await browser.close();
  console.log('✅ 截图已生成: test/screenshots/review-guest.png, test/screenshots/review-login.png');
})();
