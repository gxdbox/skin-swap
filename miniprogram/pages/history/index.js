// pages/history/index.js
const util = require('../../utils/util.js');
const app = getApp();

Page({
  data: {
    historyList: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    isLoading: false
  },

  onLoad() {
    this.loadHistory();
  },

  onShow() {
    // 每次显示时刷新数据
    this.refreshHistory();
  },

  // 加载历史记录
  async loadHistory() {
    if (this.data.isLoading || !this.data.hasMore) return;

    try {
      this.setData({ isLoading: true });

      const res = await wx.cloud.callFunction({
        name: 'getHistory',
        data: {
          page: this.data.page,
          pageSize: this.data.pageSize
        }
      });

      if (res.result.success) {
        const newList = res.result.data || [];
        const historyList = this.data.page === 1 ? newList : [...this.data.historyList, ...newList];

        // 格式化时间
        historyList.forEach(item => {
          item.relativeTime = util.formatRelativeTime(item.createdAt);
        });

        this.setData({
          historyList,
          hasMore: newList.length >= this.data.pageSize,
          page: this.data.page + 1
        });
      }
    } catch (err) {
      console.error('加载失败:', err);
      util.showError('加载失败');
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // 刷新历史记录
  async refreshHistory() {
    this.setData({ page: 1, hasMore: true });
    await this.loadHistory();
  },

  // 下拉刷新
  async onPullDownRefresh() {
    await this.refreshHistory();
    wx.stopPullDownRefresh();
  },

  // 上拉加载更多
  onReachBottom() {
    this.loadHistory();
  },

  // 清空历史
  async onClearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有历史记录吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            util.showLoading('清空中...');

            const result = await wx.cloud.callFunction({
              name: 'getHistory',
              data: {
                action: 'clear'
              }
            });

            util.hideLoading();

            if (result.result.success) {
              this.setData({ historyList: [], hasMore: false });
              util.showSuccess('已清空');
            } else {
              util.showError('清空失败');
            }
          } catch (err) {
            util.hideLoading();
            console.error('清空失败:', err);
            util.showError('清空失败');
          }
        }
      }
    });
  },

  // 查看详情
  onViewDetail(e) {
    const { index } = e.currentTarget.dataset;
    const item = this.data.historyList[index];

    if (item) {
      app.globalData.currentResult = {
        image: item.resultImage,
        sofaImage: item.sofaImage,
        fabricImage: item.fabricImage,
        taskId: item._id,
        createdAt: item.createdAt
      };

      wx.navigateTo({
        url: '/pages/detail/index'
      });
    }
  },

  // 删除单条记录
  async onDeleteItem(e) {
    const { id } = e.currentTarget.dataset;

    try {
      const res = await wx.cloud.callFunction({
        name: 'getHistory',
        data: {
          action: 'delete',
          id
        }
      });

      if (res.result.success) {
        const historyList = this.data.historyList.filter(item => item._id !== id);
        this.setData({ historyList });
        util.showSuccess('已删除');
      }
    } catch (err) {
      console.error('删除失败:', err);
      util.showError('删除失败');
    }
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '沙发换肤神器 - 历史记录',
      path: '/pages/index/index'
    };
  }
});