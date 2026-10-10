/**
 * 金币商店（龙币中心）— 竖屏模式
 *
 * 合并原「奖励中心」与「龙币兑换」：
 * - 赚金币：每日任务、打卡里程碑、连击道具、发放规则
 * - 花金币：商店商品、会员权益兑换
 * - 记录：金币流水、兑换记录
 */
const api: any = require('../../utils/api');
const { trackEvent } = require('../../utils/analytics');
const util = require('../../utils/util');

const CATEGORY_META = [
  { type: 'consumable', title: '连击道具', icon: '🛡️' },
  { type: 'theme', title: '外观主题', icon: '🎨' },
  { type: 'sound', title: '走子音效', icon: '🔊' },
  { type: 'export', title: '导出服务', icon: '📄' },
];

const CHEST_STYLES = {
  3: 'bg-amber-100 border-amber-300',
  7: 'bg-gray-100 border-gray-300',
  14: 'bg-yellow-100 border-yellow-400',
  30: 'bg-cyan-50 border-cyan-300',
  100: 'bg-rose-100 border-rose-400',
  365: 'bg-gradient-to-br from-amber-200 to-rose-200 border-amber-400',
};

Page({
  _syncTheme() {
    try {
      const app = getApp();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) this.setData({ __theme__: theme });
    } catch (e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    tab: 'earn',
    balance: 0,
    streak: null,
    shop: null,
    reward: null,
    exchanges: [],
    configs: [],
    records: [],
    ledger: [],
    loading: true,
    buying: '',
    exchanging: '',
    acting: '',
    message: '',
    msgType: 'success',
  },
  onShow() {
    this._syncTheme();
    if (!util.requireLogin('金币商城')) {
      return;
    }
    this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const [exRes, cfgRes] = await Promise.all([
        api.getDragonCoinExchanges().catch(() => null),
        api.getDragonCoinConfigs().catch(() => null),
      ]);
      this.setData({
        exchanges: exRes?.data?.exchanges || exRes || [],
        configs: cfgRes?.data?.configs || cfgRes || [],
      });

      const [shopRes, taskRes, recRes, ledRes] = await Promise.all([
        api.getDragonCoinShop().catch(() => null),
        api.getDragonCoinTasks().catch(() => null),
        api.getDragonCoinExchangeRecords(1, 20).catch(() => null),
        api.getDragonCoinLedger(1, 20).catch(() => null),
      ]);
      this.setData({
        shop: shopRes?.data || shopRes || null,
        reward: taskRes?.data || taskRes || null,
        records: recRes?.data?.records || recRes || [],
        ledger: ledRes?.data?.entries || ledRes || [],
        balance: (shopRes?.data?.balance) || (taskRes?.data?.balance) || 0,
        streak: taskRes?.data?.streak || null,
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  onTab(e: any) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab, message: '' });
  },

  async onBuy(e: any) {
    const code = e.currentTarget.dataset.code;
    trackEvent('shop_purchase', { code });
    this.setData({ buying: code, message: '' });
    try {
      const res = await api.purchaseDragonCoinShop(code);
      if (res?.success) {
        this.setData({ message: `购买成功！`, msgType: 'success' });
      } else {
        this.setData({ message: res?.error || '购买失败', msgType: 'error' });
      }
      this.loadAll();
    } catch (err: any) {
      this.setData({ message: err.message || '购买失败', msgType: 'error' });
    }
  },

  async onExchange(e: any) {
    const key = e.currentTarget.dataset.key;
    trackEvent('coin_exchange', { source: 'shop', config: key });
    this.setData({ exchanging: key, message: '' });
    try {
      const res = await api.exchangeDragonCoin(key);
      if (res?.success) {
        this.setData({ message: '兑换成功！', msgType: 'success' });
      } else {
        this.setData({ message: res?.error || '兑换失败', msgType: 'error' });
      }
      this.loadAll();
    } catch (err: any) {
      this.setData({ message: err.message || '兑换失败', msgType: 'error' });
    }
  },

  async onRepair() {
    this.setData({ acting: 'repair', message: '' });
    try {
      const res = await api.repairStreak();
      this.setData({ message: res?.data?.message || '操作成功', msgType: 'success' });
      this.loadAll();
    } catch (err: any) {
      this.setData({ message: err.message || '操作失败', msgType: 'error' });
    }
  },

  async onFreeze() {
    this.setData({ acting: 'freeze', message: '' });
    try {
      const res = await api.freezeStreak();
      this.setData({ message: res?.data?.message || '操作成功', msgType: 'success' });
      this.loadAll();
    } catch (err: any) {
      this.setData({ message: err.message || '操作失败', msgType: 'error' });
    }
  },

  onBack() {
    wx.navigateBack();
  },
});
export {};