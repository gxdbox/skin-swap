// pages/profile/index.js
const util = require('../../utils/util.js');
const app = getApp();

Page({
  data: {
    userInfo: null,
    stats: {
      fusionCount: 0,
      saveCount: 0
    },
    menuList: [
      { key: 'vip', name: '会员中心', icon: '👑' },
      { key: 'feedback', name: '意见反馈', icon: '💬' },
      { key: 'about', name: '关于我们', icon: 'ℹ️' },
      { key: 'settings', name: '设置', icon: '⚙️' }
    ]
  },

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
    this.loadUserStats();
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
      app.globalData.userInfo = userInfo;
    }
  },

  // 加载用户统计
  async loadUserStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserInfo',
        data: {}
      });

      if (res.result.success) {
        this.setData({
          stats: {
            fusionCount: res.result.data?.fusionCount || 0,
            saveCount: res.result.data?.saveCount || 0
          }
        });
      }
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // 登录
  onLogin() {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: async (res) => {
        const userInfo = res.userInfo;
        this.setData({ userInfo });
        app.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);

        // 调用云函数保存用户信息
        try {
          await wx.cloud.callFunction({
            name: 'getUserInfo',
            data: {
              action: 'update',
              userInfo
            }
          });
          util.showSuccess('登录成功');
        } catch (err) {
          console.error('保存用户信息失败:', err);
        }
      },
      fail: () => {
        util.showToast('登录取消');
      }
    });
  },

  // 点击用户卡片
  onUserCardTap() {
    if (!this.data.userInfo) {
      this.onLogin();
    }
  },

  // 菜单点击
  onMenuTap(e) {
    const { key } = e.currentTarget.dataset;

    switch (key) {
      case 'vip':
        util.showToast('会员中心开发中');
        break;
      case 'feedback':
        wx.navigateTo({
          url: '/pages/feedback/index',
          fail: () => {
            util.showToast('功能开发中');
          }
        });
        break;
      case 'about':
        wx.showModal({
          title: '关于我们',
          content: '沙发换肤神器 - AI图片融合\n版本: 1.0.0\n使用AI技术为您的沙发换上新皮肤',
          showCancel: false
        });
        break;
      case 'settings':
        util.showToast('设置功能开发中');
        break;
    }
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '沙发换肤神器 - AI图片融合',
      path: '/pages/index/index'
    };
  }
});