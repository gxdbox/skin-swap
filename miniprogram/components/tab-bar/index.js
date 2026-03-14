Component({
  properties: {
    current: {
      type: Number,
      value: 0
    }
  },

  data: {
    tabs: [
      { key: 'index', name: '首页', icon: 'home', path: '/pages/index/index' },
      { key: 'history', name: '历史', icon: 'history', path: '/pages/history/index' },
      { key: 'profile', name: '我的', icon: 'user', path: '/pages/profile/index' }
    ]
  },

  methods: {
    onTabTap(e) {
      const { index, path } = e.currentTarget.dataset;
      if (index === this.data.current) return;

      wx.switchTab({
        url: path
      });
    }
  }
});