// 报名费原生支付页
//
// 小程序 web-view 内的 H5 无法调起微信支付，故 H5 通过 wx.miniProgram.navigateTo
// 跳到本页，由本页调 wx.requestPayment 完成支付，付完 navigateBack 回 web-view。
//
// 支付参数由本页直接向后端申请（小程序 token 存在 storage 中），
// H5 侧只负责轮询订单状态确认结果。
const api = require('../../utils/api');

Page({
  data: {
    status: 'loading', // loading | paying | success | error | cancelled
    message: '',
    amount: '',
  },

  onLoad(options) {
    const raw = options.orderId || '';
    this.orderId = '';
    try {
      this.orderId = decodeURIComponent(raw);
    } catch (e) {
      this.orderId = raw;
    }
    this.setData({ amount: options.amount || '' });

    if (!this.orderId) {
      this.setData({ status: 'error', message: '缺少订单号，请返回重试' });
      return;
    }
    this.pay();
  },

  /** 申请 JSAPI 支付参数并调起支付 */
  pay() {
    if (this._paying) return;
    this._paying = true;
    this.setData({ status: 'loading', message: '' });

    const token = wx.getFileSync('auth_token');
    if (!token) {
      this._paying = false;
      this.setData({ status: 'error', message: '登录状态已失效，请返回重新登录' });
      return;
    }

    api.createJSAPIPayOrder(this.orderId)
      .then((resp) => {
        const body = resp;
        if (!body || !body.data || !body.data.timeStamp) {
          this._paying = false;
          this.setData({ status: 'error', message: body?.error || '微信支付下单失败' });
          return;
        }
        this.requestPayment(body.data);
      })
      .catch((err) => {
        this._paying = false;
        this.setData({ status: 'error', message: err.message || '网络异常，请检查网络后重试' });
      });
  },

  /** 调起微信支付 */
  requestPayment(params) {
    this.setData({ status: 'paying' });
    wx.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType || 'RSA',
      paySign: params.paySign,
      success: () => {
        this._paying = false;
        this.setData({ status: 'success', message: '支付成功，报名已完成' });
        // 支付结果以后端回调为准，稍后返回由 H5 轮询确认
        setTimeout(() => this.back(), 1200);
      },
      fail: (err) => {
        this._paying = false;
        const cancelled = /cancel/i.test((err && err.errMsg) || '');
        this.setData({
          status: cancelled ? 'cancelled' : 'error',
          message: cancelled ? '您已取消支付' : '支付失败，请重试',
        });
      },
    });
  },

  /** 返回 web-view 页面 */
  back() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        // 无历史页面（如直接进入本页）时回到系统主页
        wx.reLaunch({ url: '/pages/index/index' });
      },
    });
  },

  onRetry() {
    this.pay();
  },
});