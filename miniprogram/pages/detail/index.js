// pages/detail/index.js
const util = require('../../utils/util.js');
const app = getApp();

Page({
  data: {
    result: null,
    isSaving: false
  },

  onLoad(options) {
    // 从全局数据获取当前结果
    const result = app.globalData.currentResult;
    if (result) {
      result.createdAt = util.formatDate(new Date());
      this.setData({ result });
    } else {
      util.showToast('数据加载失败');
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  // 保存到相册
  async onSaveToAlbum() {
    if (this.data.isSaving) return;

    const { result } = this.data;
    if (!result || !result.image) {
      util.showToast('没有可保存的图片');
      return;
    }

    try {
      this.setData({ isSaving: true });

      // 如果是云存储路径，先下载
      let filePath = result.image;
      if (filePath.startsWith('cloud://')) {
        const res = await wx.cloud.downloadFile({
          fileID: filePath
        });
        filePath = res.tempFilePath;
      }

      // 保存到相册
      await wx.saveImageToPhotosAlbum({
        filePath
      });

      util.showSuccess('已保存到相册');

      // 更新用户统计
      await wx.cloud.callFunction({
        name: 'getUserInfo',
        data: {
          action: 'incrementSave'
        }
      });
    } catch (err) {
      console.error('保存失败:', err);
      if (err.errMsg && err.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '提示',
          content: '需要您授权保存图片到相册',
          confirmText: '去授权',
          success(res) {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
      } else {
        util.showError('保存失败');
      }
    } finally {
      this.setData({ isSaving: false });
    }
  },

  // 分享给好友
  onShareAppMessage() {
    const { result } = this.data;
    return {
      title: '快来看看我合成的沙发效果！',
      path: '/pages/index/index',
      imageUrl: result?.image
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const { result } = this.data;
    return {
      title: '沙发换肤神器 - AI图片融合',
      query: '',
      imageUrl: result?.image
    };
  },

  // 返回首页
  onGoBack() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});