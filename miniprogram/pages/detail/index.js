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
      util.showLoading('保存中...');

      // 先检查权限
      console.log('检查相册写入权限...');
      const authRes = await wx.getSetting();
      console.log('当前权限设置:', authRes.authSetting);

      if (authRes.authSetting['scope.writePhotosAlbum'] === false) {
        console.log('用户已拒绝相册权限');
        util.hideLoading();
        wx.showModal({
          title: '需要授权',
          content: '需要您授权保存图片到相册，请在设置中开启权限',
          confirmText: '去授权',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting({
                success: (settingRes) => {
                  console.log('用户设置后的权限:', settingRes.authSetting);
                  if (settingRes.authSetting['scope.writePhotosAlbum']) {
                    util.showToast('权限已开启，请重试');
                  }
                }
              });
            }
          }
        });
        return;
      }

      // 获取图片路径
      let filePath = result.image;
      console.log('原始图片路径:', filePath);

      // 如果是云存储路径或网络URL，先下载到本地
      if (filePath.startsWith('cloud://') || filePath.startsWith('http')) {
        console.log('需要下载图片...');
        
        if (filePath.startsWith('cloud://')) {
          console.log('下载云存储图片:', filePath);
          const res = await wx.cloud.downloadFile({
            fileID: filePath
          });
          filePath = res.tempFilePath;
          console.log('云存储下载完成，临时路径:', filePath);
        } else if (filePath.startsWith('http')) {
          console.log('下载网络图片:', filePath);
          const res = await new Promise((resolve, reject) => {
            wx.downloadFile({
              url: filePath,
              success: resolve,
              fail: reject
            });
          });
          filePath = res.tempFilePath;
          console.log('网络图片下载完成，临时路径:', filePath);
        }
      }

      console.log('最终保存路径:', filePath);
      console.log('开始保存图片到相册...');
      
      // 保存到相册
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: (res) => {
            console.log('保存成功:', res);
            resolve(res);
          },
          fail: (err) => {
            console.error('保存失败:', err);
            reject(err);
          }
        });
      });

      util.hideLoading();
      util.showSuccess('已保存到相册');
      console.log('图片已保存到相册');

      // 更新用户统计
      try {
        await wx.cloud.callFunction({
          name: 'getUserInfo',
          data: {
            action: 'incrementSave'
          }
        });
      } catch (cloudErr) {
        console.error('更新统计失败:', cloudErr);
      }
    } catch (err) {
      util.hideLoading();
      console.error('保存失败:', err);
      console.error('错误信息:', err.errMsg);
      
      if (err.errMsg && (err.errMsg.includes('auth deny') || err.errMsg.includes('permission denied'))) {
        wx.showModal({
          title: '需要授权',
          content: '需要您授权保存图片到相册，请在设置中开启权限',
          confirmText: '去授权',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting({
                success: (settingRes) => {
                  console.log('用户设置:', settingRes);
                  if (settingRes.authSetting['scope.writePhotosAlbum']) {
                    util.showToast('权限已开启，请重试');
                  }
                }
              });
            }
          }
        });
      } else {
        util.showError('保存失败，请重试');
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