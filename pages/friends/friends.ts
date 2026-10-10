/**
 * 好友系统页
 *
 * 三块内容：
 * 1. 好友清单（含在线状态）与好友请求处理
 * 2. 邀请好友：生成小程序码 / 邀请链接 + 可复制文案，扫码或点链接即自动成为好友
 * 3. 对好友发起带时限的对局挑战（WS），并接收对方的挑战弹窗
 *
 * 在线状态用 30 秒轮询刷新：后端 friend:online_status 事件只挂在 Socket.IO 路径上，
 * 小程序走的 /ws 网关没有派发该事件，推送拿不到，轮询是当前唯一可靠手段。
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
const wsClient = require('../../utils/ws');
const friendInvite = require('../../utils/friendInvite');
const { trackEvent } = require('../../utils/analytics');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    friends: [] as any[],
    requests: [] as any[],
    searchQuery: '',
    searchResults: [] as any[],
    loading: true,
    activeTab: 'friends',

    // ===== 免打扰（DND）=====
    dndEnabled: false,

    // ===== 邀请好友面板 =====
    showInvitePanel: false,
    timePresets: friendInvite.getTimePresets(),
    presetIndex: friendInvite.getDefaultPresetIndex(),
    inviteCreating: false,
    /** { id, token, qrCodeDataUrl, urlLink, expiresAt, qrError, urlLinkError } */
    inviteData: null as any,
    inviteText: '',
    canShare: false,

    // ===== 收到的挑战弹窗 =====
    showChallengeDialog: false,
    challengeData: null as any,

    // ===== 挑战发送中 =====
    challengeSending: false,
  },

  // 本次页面停留内是否已记录过一次搜索（onSearchInput 每敲一个字符都会触发）
  _searchTracked: false as boolean,
  _unsubs: [] as (() => void)[],
  _presenceTimer: null as any,

  _syncTheme() {
    try {
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) {
        this.setData({ __theme__: theme });
      }
    } catch (e) { /* non-critical */ }
  },

  onShow() {
    this._syncTheme();
    this._searchTracked = false;
    if (!app.globalData.token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.loadFriends();
    this.loadRequests();
    this._setupWs();
    this._startPresencePolling();
  },

  onHide() {
    this._cleanupWs();
    this._stopPresencePolling();
  },

  onUnload() {
    this._cleanupWs();
    this._stopPresencePolling();
  },

  // ===== WS：挑战送达 / 撤回 / 错误提示 =====

  _setupWs() {
    this._cleanupWs();
    const unsubs: (() => void)[] = [];
    if (wsClient.status === 'idle' || wsClient.status === 'disconnected') {
      wsClient.connect();
    }
    unsubs.push(wsClient.on('pvp:invite_received', (p: any) => this._onChallengeReceived(p)));
    unsubs.push(wsClient.on('pvp:invite_accepted', () => {
      this.setData({ challengeSending: false });
      util.showToast('对方接受了挑战', 'success');
    }));
    unsubs.push(wsClient.on('pvp:invite_declined', () => {
      this.setData({ challengeSending: false });
      util.showToast('对方拒绝了挑战');
    }));
    unsubs.push(wsClient.on('pvp:invite_cancelled', () => {
      this.setData({ challengeSending: false });
    }));
    // 免打扰状态：服务端在连接时推送权威状态
    unsubs.push(wsClient.on('pvp:dnd_state', (p: any) => {
      this.setData({ dndEnabled: !!p?.enabled });
    }));
    // 后端把「对方不在线 / 免打扰 / 对局中」等拒绝原因走 game:error 回传
    unsubs.push(wsClient.on('game:error', (p: any) => {
      if (!this.data.challengeSending) return;
      this.setData({ challengeSending: false });
      util.showToast(p?.message || '挑战发送失败');
    }));
    this._unsubs = unsubs;
  },

  _cleanupWs() {
    for (const fn of this._unsubs) fn();
    this._unsubs = [];
  },

  /** 收到挑战：弹窗让用户选择接受 / 拒绝 */
  _onChallengeReceived(payload: any) {
    const invite = payload?.invite;
    if (!invite) return;
    this.setData({
      showChallengeDialog: true,
      challengeData: {
        inviteId: invite.matchId,
        fromUsername: invite.fromUsername || '对手',
        fromRating: invite.fromRating || 0,
        timeLabel: friendInvite.formatTimeControl(invite.timeControl),
      },
    });
    try { wx.vibrateShort({ type: 'medium' }); } catch (e) { /* 部分基础库不支持震动 */ }
  },

  /**
   * 接受挑战。
   *
   * 不在这里直接发 pvp:invite_accept：接受后服务端立刻发 match:found 开局事件，
   * 而开局处理逻辑在对弈页。若在本页接受，本页没订阅 match:found，开局事件就丢了。
   * 因此把邀请交接给对弈页，由它连上 WS 并订阅后再接受。
   */
  onChallengeAccept() {
    const data = this.data.challengeData;
    if (!data || !data.inviteId) return;
    app.globalData.pendingInviteAccept = { inviteId: data.inviteId };
    this.setData({ showChallengeDialog: false, challengeData: null });
    wx.navigateTo({ url: '/pages/online/online' });
  },

  onChallengeDecline() {
    const data = this.data.challengeData;
    this.setData({ showChallengeDialog: false, challengeData: null });
    if (data && data.inviteId) {
      wsClient.send('pvp:invite_decline', { inviteId: data.inviteId });
    }
  },

  // ===== 免打扰（DND）=====

  /** 切换免打扰：开启后其他玩家看不到自己，也无法邀请对弈 */
  onToggleDnd() {
    const enabled = !this.data.dndEnabled;
    this.setData({ dndEnabled: enabled });
    trackEvent('dnd_toggle', { enabled });
    if (wsClient.status === 'connected') {
      wsClient.send('pvp:set_dnd', { enabled });
    } else {
      util.showToast('连接已断开，稍后重试', 'none');
    }
  },

  // ===== 在线状态轮询 =====

  _startPresencePolling() {
    this._stopPresencePolling();
    this._presenceTimer = setInterval(() => this.loadFriends(true), 30000);
  },

  _stopPresencePolling() {
    if (this._presenceTimer) {
      clearInterval(this._presenceTimer);
      this._presenceTimer = null;
    }
  },

  onTabChange(e: any) {
    // dataset 里拿标签值：e.detail 是 tap 的坐标对象，不是 data-tab
    const tab = e.currentTarget.dataset.tab;
    if (tab) this.setData({ activeTab: tab });
  },

  /** @param silent 轮询刷新时不显示 loading，避免列表每 30 秒闪一次 */
  async loadFriends(silent: boolean = false) {
    if (!silent) this.setData({ loading: true });
    try {
      const res = await api.getFriendList();
      const list = res?.data || res || [];
      const friends = (Array.isArray(list) ? list : []).map((f: any) => ({
        ...f,
        // 后端字段是 isOnline 布尔值；status 是好友关系状态（恒为 accepted），
        // 早先误用 status === 'online' 判断，导致永远显示离线
        isOnline: !!f.isOnline,
        avatarText: (f.username || '?').substring(0, 1).toUpperCase(),
      }));
      // 在线的好友排前面，其余按等级分降序（与网页版 FriendLobby 一致）
      friends.sort((a: any, b: any) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return (b.rating || 0) - (a.rating || 0);
      });
      this.setData({ friends, loading: false });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  async loadRequests() {
    try {
      const res = await api.getFriendRequests();
      const list = res?.data || res || [];
      this.setData({
        requests: (Array.isArray(list) ? list : []).map((r: any) => ({
          ...r,
          avatarText: (r.fromUsername || '?').substring(0, 1).toUpperCase(),
        })),
      });
    } catch (e) { /* 请求列表失败不影响好友列表展示 */ }
  },

  // ===== 搜索与加好友 =====

  onSearchInput(e: any) {
    const q = e.detail.value.trim();
    this.setData({ searchQuery: q });
    if (!q) {
      this.setData({ searchResults: [] });
      return;
    }
    // 每次输入都会触发，只按「有关键词」记一次，后续输入不再打扰埋点
    if (!this._searchTracked) {
      this._searchTracked = true;
      trackEvent('search', { scope: 'friends', query: q });
    }
    api.searchUsers(q)
      .then((res: any) => {
        const list = res?.data || res || [];
        this.setData({
          searchResults: (Array.isArray(list) ? list : []).map((u: any) => ({
            ...u,
            avatarText: (u.username || '?').substring(0, 1).toUpperCase(),
            // 后端已算好关系，直接决定按钮文案，避免给已是好友的人再显示「+」被拒
            relationLabel: u.relation === 'friend' ? '已是好友'
              : u.relation === 'requested' ? '已申请'
              : u.relation === 'incoming' ? '待处理'
              : '加好友',
            canAdd: u.relation === 'none',
          })),
        });
      })
      .catch(() => {});
  },

  onAddFriend(e: any) {
    const userId = e.currentTarget.dataset.id;
    trackEvent('social_add_friend');
    api.sendFriendRequest(userId)
      .then(() => {
        util.showToast('已发送好友请求', 'success');
        this.loadRequests();
        if (this.data.searchQuery) this.onSearchInput({ detail: { value: this.data.searchQuery } });
      })
      .catch((err: any) => {
        util.showToast(err.message || '发送失败');
      });
  },

  onAcceptRequest(e: any) {
    const id = e.currentTarget.dataset.id;
    api.acceptFriendRequest(id)
      .then(() => {
        util.showToast('已接受', 'success');
        this.loadFriends();
        this.loadRequests();
      })
      .catch((err: any) => {
        util.showToast(err.message || '操作失败');
      });
  },

  onRejectRequest(e: any) {
    const id = e.currentTarget.dataset.id;
    api.rejectFriendRequest(id)
      .then(() => this.loadRequests())
      .catch((err: any) => {
        util.showToast(err.message || '操作失败');
      });
  },

  onRemoveFriend(e: any) {
    const userId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这位好友吗？',
      success: (res: any) => {
        if (res.confirm) {
          api.removeFriend(userId)
            .then(() => {
              util.showToast('已删除', 'success');
              this.loadFriends();
            })
            .catch((err: any) => {
              util.showToast(err.message || '删除失败');
            });
        }
      },
    });
  },

  onChatFriend(e: any) {
    const { id, name } = e.currentTarget.dataset;
    // 带上 username：聊天页顶部标题要用，早先没传导致标题恒为空
    wx.navigateTo({ url: `/pages/messages/chat/chat?userId=${id}&username=${encodeURIComponent(name || '')}` });
  },

  // ===== 对好友发起挑战 =====

  onChallengeFriend(e: any) {
    const { id, name } = e.currentTarget.dataset;
    const presets = this.data.timePresets;
    wx.showActionSheet({
      itemList: presets.map((p: any) => p.label),
      success: (res: any) => {
        const preset = presets[res.tapIndex];
        if (!preset) return;
        this._sendChallenge(id, name, preset);
      },
    });
  },

  _sendChallenge(toUserId: any, toName: string, preset: any) {
    if (this.data.challengeSending) return;
    if (wsClient.status !== 'connected') {
      util.showToast('连接已断开，请稍后重试');
      return;
    }
    this.setData({ challengeSending: true });
    trackEvent('pvp_friend_challenge');
    wsClient.send('pvp:friend_challenge', {
      toUserId: Number(toUserId),
      timeControl: { mode: preset.mode, initialTime: preset.initialTime, increment: preset.increment },
    });
    util.showToast(`已向 ${toName || '好友'} 发起 ${preset.label} 挑战`, 'success');
    // 未收到回执也无妨：对方接受/拒绝或后端报错都会清掉这个状态
    setTimeout(() => {
      if (this.data.challengeSending) this.setData({ challengeSending: false });
    }, 8000);
  },

  // ===== 邀请好友（生成小程序码 / 链接）=====

  onOpenInvite() {
    trackEvent('friend_invite_open');
    this.setData({
      showInvitePanel: true,
      inviteData: null,
      inviteText: '',
      canShare: false,
    });
  },

  onCloseInvite() {
    this.setData({ showInvitePanel: false, inviteData: null, inviteText: '', inviteCreating: false });
  },

  onSelectPreset(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    if (isNaN(index)) return;
    this.setData({ presetIndex: index, inviteData: null, inviteText: '' });
  },

  /** 生成邀请：先建挑战拿 token，再取小程序码与链接 */
  onGenerateInvite() {
    if (this.data.inviteCreating) return;
    const preset = this.data.timePresets[this.data.presetIndex];
    if (!preset) return;
    this.setData({ inviteCreating: true });

    api.createFriendChallenge({
      mode: preset.mode,
      initialTime: preset.initialTime,
      increment: preset.increment,
    })
      .then((res: any) => {
        const data = res?.data || res || {};
        if (!data.id) throw new Error('生成邀请失败');
        return api.getFriendChallengeShareCode(data.id).then((assetRes: any) => {
          const asset = assetRes?.data || assetRes || {};
          this._applyInvite(data, asset, preset);
        });
      })
      .catch((err: any) => {
        this.setData({ inviteCreating: false });
        util.showToast(err.message || '生成邀请失败');
      });
  },

  _applyInvite(challenge: any, asset: any, preset: any) {
    const username = app.globalData.user?.username || '';
    const timeLabel = friendInvite.formatTimeControl(preset);
    // 优先用可直接点开的小程序链接；拿不到就不在文案里放链接，
    // 避免复制出去的文本里带一条打不开的地址
    const link = asset.urlLink || '';
    const inviteText = friendInvite.buildInviteText({
      username,
      timeLabel,
      link,
    });

    this.setData({
      inviteCreating: false,
      inviteData: {
        id: challenge.id,
        token: challenge.token,
        expiresAt: challenge.expiresAt,
        qrCodeDataUrl: asset.qrCodeDataUrl || '',
        urlLink: link,
        qrError: asset.qrError || '',
        urlLinkError: asset.urlLinkError || '',
      },
      inviteText,
      canShare: true,
    });
  },

  onCopyInviteText() {
    const text = this.data.inviteText;
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: () => {
        trackEvent('friend_invite_copy');
        util.showToast('邀请文案已复制，去微信粘贴给好友', 'success');
      },
    });
  },

  onCopyInviteLink() {
    const link = this.data.inviteData?.urlLink;
    if (!link) return;
    wx.setClipboardData({
      data: link,
      success: () => util.showToast('链接已复制', 'success'),
    });
  },

  /**
   * 转发给微信好友：邀请链接指向落地页，对方点开即自动成为好友。
   * 未生成邀请时退化为分享本页，不至于点不动。
   */
  onShareAppMessage() {
    const token = this.data.inviteData?.token;
    const preset = this.data.timePresets[this.data.presetIndex];
    const timeLabel = preset ? friendInvite.formatTimeControl(preset) : '';
    if (token) {
      trackEvent('friend_invite_share');
      return {
        title: `⚔️ 邀请你下一局 ${timeLabel} 国际象棋，点开自动成为好友`,
        path: `/pages/friend-invite/index?token=${token}`,
      };
    }
    return {
      title: '⚔️ Mychess 国际象棋 · 加个好友一起对弈',
      path: '/pages/friends/friends',
    };
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    const token = this.data.inviteData?.token;
    if (token) {
      return {
        title: '⚔️ 邀请你下一局国际象棋，点开自动成为好友',
        query: `token=${encodeURIComponent(token)}`,
      };
    }
    return {
      title: '♟️ MyChess 国际象棋 · AI 陪练在线对弈',
      query: '',
    };
  },

  onBack() {
    util.navigateBackSafe('/pages/choice/choice');
  },

  stopPropagation() {},
});

export {};
