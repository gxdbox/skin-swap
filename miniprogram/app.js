// app.js
App({
  onLaunch: function () {
    this.globalData = {
      env: "cloud1-0g6q8c7v1cdda39b",
      openid: '',
      userInfo: null,
      currentResult: null
    };

    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });

      // 获取 openid
      this.getOpenId();
    }
  },

  // 获取用户 openid
  getOpenId: function() {
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: {},
      success: res => {
        if (res.result && res.result.success && res.result.data) {
          this.globalData.openid = res.result.data.openid;
        }
      },
      fail: err => {
        console.error('获取 openid 失败:', err);
      }
    });
  },

  globalData: {
    userInfo: null,
    openid: '',
    env: '',
    currentResult: null
  }
});