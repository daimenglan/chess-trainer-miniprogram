/**
 * 好友对弈大厅（在线对弈页的「👥 好友对弈」页签）
 *
 * 与网页版 components/Pvp/FriendLobby.tsx 对齐：
 *   时限选择 → 生成邀请二维码/链接 → 好友列表（在线优先）→ 一键挑战 → 搜索加好友
 *
 * 职责边界：
 *   - 挑战走 WS `pvp:friend_challenge`，与「好友」页同一通道（后端拦截离线/免打扰/对局中）
 *   - 失败提示由所在页面的 game:error 统一 toast，本组件不重复订阅，避免双重提示
 *   - 邀请链接复用既有落地页 pages/friend-invite/index，本组件只负责生成与展示物料
 *
 * 在线状态用 30 秒轮询刷新：后端 friend:online_status 只挂在 Socket.IO 路径上，
 * 小程序走的 /ws 网关没有派发该事件（与 pages/friends 的既有结论一致）。
 */
const api = require('../../utils/api');
const util = require('../../utils/util');
const wsClient = require('../../utils/ws').default;
const friendInvite = require('../../utils/friendInvite');
const { trackEvent } = require('../../utils/analytics');

/** 待处理邀请的本地兜底清理时长：对方接受/拒绝/取消或后端报错都会提前清掉 */
const PENDING_TIMEOUT_MS = 8000;

Component({
  properties: {
    /** WS 是否已连接：未连接时禁用挑战与邀请生成 */
    connected: {
      type: Boolean,
      value: false,
    },
    /** 自己是否正在对局中：对局中不能发起挑战 */
    inGame: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    friends: [] as any[],
    loading: true,
    /** 时限预设（与「好友」页、落地页共用同一份，保证链路一致） */
    timePresets: friendInvite.getTimePresets(),
    presetIndex: friendInvite.getDefaultPresetIndex(),
    /** 当前时限的中文说明，用于提示文案 */
    timeLabel: friendInvite.formatTimeControl(
      friendInvite.getTimePresets()[friendInvite.getDefaultPresetIndex()],
    ),
    /** 好友总览：在线人数 / 总数（WXML 里不写聚合表达式，统一在此算好） */
    onlineCount: 0,
    friendCount: 0,

    // ===== 邀请生成 =====
    inviteCreating: false,
    /** { id, token, qrCodeDataUrl, urlLink, qrError, urlLinkError } */
    inviteData: null as any,
    inviteText: '',

    // ===== 挑战中 =====
    pendingUserId: null as number | null,

    // ===== 搜索加好友 =====
    searchQuery: '',
    searchResults: [] as any[],
    addingId: null as number | null,
  },

  lifetimes: {
    attached(this: any) {
      this._setupWs();
      // 组件由 wx:if 懒创建，attached 时页面可能已显示，故首拉放在这里而不是 pageLifetimes.show
      this.loadFriends();
      this._startPresencePolling();
    },
    detached(this: any) {
      this._cleanupWs();
      this._stopPresencePolling();
      this._clearPendingTimer();
    },
  },

  pageLifetimes: {
    show(this: any) {
      this.loadFriends(true);
      this._startPresencePolling();
    },
    hide(this: any) {
      this._stopPresencePolling();
    },
  },

  methods: {
    // ===== WS =====

    _setupWs(this: any) {
      this._cleanupWs();
      const unsubs: (() => void)[] = [];
      // 不主动 connect：连接由在线对弈页统一维护，这里只订阅
      unsubs.push(wsClient.on('pvp:invite_sent', (p: any) => this._onInviteSent(p)));
      unsubs.push(wsClient.on('pvp:invite_accepted', () => this._clearPending()));
      unsubs.push(wsClient.on('pvp:invite_declined', () => this._clearPending()));
      unsubs.push(wsClient.on('pvp:invite_cancelled', () => this._clearPending()));
      this._unsubs = unsubs;
    },

    _cleanupWs(this: any) {
      for (const fn of this._unsubs || []) fn();
      this._unsubs = [];
    },

    /** 服务端确认邀请已送达：锁定对应好友卡片为「邀请中」 */
    _onInviteSent(this: any, payload: any) {
      const invite = payload?.invite;
      if (!invite || !invite.toUserId) return;
      this.setData({ pendingUserId: invite.toUserId });
      this._armPendingTimer();
    },

    /** 清除「邀请中」状态 */
    _clearPending(this: any) {
      this._clearPendingTimer();
      if (this.data.pendingUserId !== null) this.setData({ pendingUserId: null });
    },

    /** 对方长时间无回应或后端报错时的兜底：避免卡片永久停在「邀请中」 */
    _armPendingTimer(this: any) {
      this._clearPendingTimer();
      this._pendingTimer = setTimeout(() => {
        this._pendingTimer = null;
        this.setData({ pendingUserId: null });
      }, PENDING_TIMEOUT_MS);
    },

    _clearPendingTimer(this: any) {
      if (this._pendingTimer) {
        clearTimeout(this._pendingTimer);
        this._pendingTimer = null;
      }
    },

    // ===== 好友列表 =====

    /** @param silent 轮询刷新时不显示 loading，避免列表每 30 秒闪一次 */
    loadFriends(this: any, silent: boolean = false) {
      if (!silent) this.setData({ loading: true });
      api.getFriendList()
        .then((res: any) => {
          const list = res?.data || res || [];
          const friends = (Array.isArray(list) ? list : []).map((f: any) => ({
            ...f,
            isOnline: !!f.isOnline,
            avatarText: (f.username || '?').substring(0, 1).toUpperCase(),
            rating: f.rating || 1500,
          }));
          // 在线的好友排前面，其余按等级分降序（与网页版 FriendLobby 一致）
          friends.sort((a: any, b: any) => {
            if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
            return (b.rating || 0) - (a.rating || 0);
          });
          this.setData({
            friends,
            loading: false,
            friendCount: friends.length,
            onlineCount: friends.filter((f: any) => f.isOnline).length,
          });
        })
        .catch(() => {
          this.setData({ loading: false });
        });
    },

    _startPresencePolling(this: any) {
      this._stopPresencePolling();
      this._presenceTimer = setInterval(() => this.loadFriends(true), 30000);
    },

    _stopPresencePolling(this: any) {
      if (this._presenceTimer) {
        clearInterval(this._presenceTimer);
        this._presenceTimer = null;
      }
    },

    // ===== 时限 =====

    onPresetChange(this: any, e: any) {
      const index = Number(e.detail.value);
      if (isNaN(index) || !this.data.timePresets[index]) return;
      // 时限变了，之前生成的邀请作废（链接里写死了时限）
      this.setData({
        presetIndex: index,
        timeLabel: friendInvite.formatTimeControl(this.data.timePresets[index]),
        inviteData: null,
        inviteText: '',
      });
      this._emitInviteChange();
    },

    // ===== 生成邀请 =====

    onGenerateInvite(this: any) {
      if (this.data.inviteCreating) return;
      const preset = this.data.timePresets[this.data.presetIndex];
      if (!preset) return;
      if (!this.data.connected) {
        util.showToast('连接已断开，请稍后重试');
        return;
      }
      this.setData({ inviteCreating: true });
      trackEvent('friend_invite_create', { from: 'online' });

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
          util.showToast(err?.message || '生成邀请失败');
        });
    },

    _applyInvite(this: any, challenge: any, asset: any, preset: any) {
      const username = (getApp().globalData.user || {}).username || '';
      const timeLabel = friendInvite.formatTimeControl(preset);
      // 优先用可直接点开的小程序链接；拿不到就不在文案里放链接，避免复制出去打不开
      const link = asset.urlLink || '';
      const inviteText = friendInvite.buildInviteText({ username, timeLabel, link });

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
      });
      this._emitInviteChange();
    },

    /** 通知所在页面当前邀请 token，供页面 onShareAppMessage 生成分享路径 */
    _emitInviteChange(this: any) {
      const data = this.data.inviteData;
      this.triggerEvent('invitechange', {
        token: data ? data.token : '',
        timeLabel: this.data.timeLabel,
      });
    },

    onCopyInviteText(this: any) {
      const text = this.data.inviteText;
      if (!text) return;
      wx.setClipboardData({
        data: text,
        success: () => {
          trackEvent('friend_invite_copy', { from: 'online' });
          util.showToast('邀请文案已复制，去微信粘贴给好友', 'success');
        },
      });
    },

    onCopyInviteLink(this: any) {
      const link = this.data.inviteData?.urlLink;
      if (!link) return;
      wx.setClipboardData({
        data: link,
        success: () => util.showToast('链接已复制', 'success'),
      });
    },

    onResetInvite(this: any) {
      this.setData({ inviteData: null, inviteText: '' });
      this._emitInviteChange();
    },

    // ===== 挑战好友 =====

    onChallengeFriend(this: any, e: any) {
      const userId = Number(e.currentTarget.dataset.id);
      const name = e.currentTarget.dataset.name || '好友';
      if (!userId) return;
      if (this.data.pendingUserId !== null) return;
      if (this.data.inGame) {
        util.showToast('你正在对局中，暂时无法发起挑战');
        return;
      }
      if (!this.data.connected || wsClient.status !== 'connected') {
        util.showToast('连接已断开，请稍后重试');
        return;
      }
      const preset = this.data.timePresets[this.data.presetIndex];
      if (!preset) return;

      trackEvent('pvp_friend_challenge', { from: 'online' });
      wsClient.send('pvp:friend_challenge', {
        toUserId: userId,
        timeControl: { mode: preset.mode, initialTime: preset.initialTime, increment: preset.increment },
      });
      this.setData({ pendingUserId: userId });
      this._armPendingTimer();
      util.showToast(`已向 ${name} 发起 ${preset.label} 挑战`, 'success');
    },

    // ===== 搜索加好友 =====

    onSearchInput(this: any, e: any) {
      const q = (e.detail.value || '').trim();
      this.setData({ searchQuery: q });
      if (!q) {
        this.setData({ searchResults: [] });
        return;
      }
      api.searchUsers(q)
        .then((res: any) => {
          const list = res?.data || res || [];
          this.setData({
            searchResults: (Array.isArray(list) ? list : []).map((u: any) => ({
              ...u,
              avatarText: (u.username || '?').substring(0, 1).toUpperCase(),
              // 后端已算好关系，直接决定按钮文案，避免给已是好友的人再显示「加好友」被拒
              relationLabel: u.relation === 'friend' ? '已是好友'
                : u.relation === 'requested' ? '已申请'
                : u.relation === 'incoming' ? '待处理'
                : '加好友',
              canAdd: u.relation === 'none',
            })),
          });
        })
        .catch(() => { /* 搜索失败静默：输入框内容仍保留 */ });
    },

    onAddFriend(this: any, e: any) {
      const userId = Number(e.currentTarget.dataset.id);
      if (!userId || this.data.addingId !== null) return;
      this.setData({ addingId: userId });
      trackEvent('social_add_friend', { from: 'online' });
      api.sendFriendRequest(userId)
        .then(() => {
          util.showToast('已发送好友请求', 'success');
          // 就地标记为「已申请」，不重搜（重搜也拿不到新状态）
          const results = (this.data.searchResults || []).map((u: any) =>
            u.userId === userId && u.relation === 'none'
              ? { ...u, relation: 'requested', relationLabel: '已申请', canAdd: false }
              : u);
          this.setData({ searchResults: results, addingId: null });
        })
        .catch((err: any) => {
          this.setData({ addingId: null });
          util.showToast(err?.message || '发送失败');
        });
    },
  },
});

export {};
