// pages/index/index.js
const util = require('../../utils/util.js');
const app = getApp();

Page({
  data: {
    // 沙发图片
    sofaImage: '',
    sofaFileId: '',
    // 布料列表（支持多张，最多5张）
    customFabrics: [],
    // 是否正在处理
    isProcessing: false,
    // 当前任务ID
    currentTaskId: '',
    // 合成结果
    result: null,
    // 用户信息
    userInfo: null
  },

  onLoad() {
    this.checkLogin();
  },

  onShow() {
    // 刷新用户信息
    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo });
    }
  },

  // 检查登录状态
  checkLogin() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
      app.globalData.userInfo = userInfo;
    }
  },

  // 上传沙发图片
  async onUploadSofa() {
    try {
      const tempFiles = await util.chooseImage(1);
      const tempPath = tempFiles[0];

      util.showLoading('上传中...');

      // 压缩图片 - 限制尺寸和质量
      const compressedPath = await compressImageForAI(tempPath);

      // 上传到云存储
      const cloudPath = util.generateCloudPath(app.globalData.openid || 'anonymous', 'sofa');
      const fileId = await util.uploadFile(compressedPath, cloudPath);

      this.setData({
        sofaImage: compressedPath,
        sofaFileId: fileId
      });

      util.hideLoading();
      util.showSuccess('上传成功');
    } catch (err) {
      util.hideLoading();
      console.error('上传失败:', err);
      util.showError('上传失败');
    }
  },

  // 删除沙发图片
  onDeleteSofa() {
    this.setData({
      sofaImage: '',
      sofaFileId: ''
    });
  },

  // 上传自定义布料
  async onUploadFabric() {
    const { customFabrics } = this.data;
    
    // 检查是否已达到上限
    if (customFabrics.length >= 5) {
      util.showToast('最多只能上传 5 张布料');
      return;
    }

    try {
      const tempFiles = await util.chooseImage(1);
      const tempPath = tempFiles[0];

      util.showLoading('上传中...');

      // 压缩图片 - 限制尺寸和质量
      const compressedPath = await compressImageForAI(tempPath);

      // 上传到云存储
      const cloudPath = util.generateCloudPath(app.globalData.openid || 'anonymous', 'fabric');
      const fileId = await util.uploadFile(compressedPath, cloudPath);

      // 添加到布料列表
      const newFabric = {
        id: Date.now(),
        image: compressedPath,
        fileId: fileId
      };

      this.setData({
        customFabrics: [...customFabrics, newFabric]
      });

      util.hideLoading();
      util.showSuccess('上传成功');
    } catch (err) {
      util.hideLoading();
      console.error('上传失败:', err);
      util.showError('上传失败');
    }
  },

  // 删除自定义布料
  onDeleteFabric(e) {
    const { id } = e.currentTarget.dataset;
    const customFabrics = this.data.customFabrics.filter(f => f.id !== id);
    this.setData({ customFabrics });
  },

  // 开始合成
  async onStartFuse() {
    const { sofaImage, sofaFileId, customFabrics } = this.data;

    // 验证
    if (!sofaImage) {
      util.showToast('请先上传沙发图片');
      return;
    }

    if (customFabrics.length === 0) {
      util.showToast('请上传至少一张布料');
      return;
    }

    // 检查登录
    if (!this.data.userInfo) {
      this.onLogin();
      return;
    }

    try {
      this.setData({ isProcessing: true });
      util.showLoading('正在合成...');

      // 使用第一张布料进行合成
      const firstFabric = customFabrics[0];
      const fabricUrl = firstFabric.image;
      const fabricFileId = firstFabric.fileId;

      // 调用云函数
      const res = await wx.cloud.callFunction({
        name: 'combinePictures',
        data: {
          action: 'create',
          sofaImageUrl: sofaFileId || sofaImage,
          fabricImageUrl: fabricFileId || fabricUrl
        }
      });

      util.hideLoading();

      if (res.result.success) {
        const taskId = res.result.taskId;
        this.setData({ currentTaskId: taskId });

        // 开始轮询任务状态
        this.pollTaskStatus(taskId);
      } else {
        this.setData({ isProcessing: false });
        util.showError(res.result.message || '合成失败');
      }
    } catch (err) {
      this.setData({ isProcessing: false });
      util.hideLoading();
      console.error('合成失败:', err);
      util.showError('合成失败，请重试');
    }
  },

  // 轮询任务状态
  async pollTaskStatus(taskId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'combinePictures',
        data: {
          action: 'getStatus',
          taskId
        }
      });

      if (res.result.success) {
        const { status, resultImageUrl, error } = res.result;

        if (status === 'completed') {
          this.setData({
            isProcessing: false,
            result: {
              image: resultImageUrl,
              sofaImage: this.data.sofaImage,
              fabricImage: this.data.customFabrics[0]?.image,
              taskId
            }
          });
          util.showSuccess('合成完成');
        } else if (status === 'failed') {
          this.setData({ isProcessing: false });
          util.showError(error || '合成失败');
        } else {
          // 继续轮询
          setTimeout(() => this.pollTaskStatus(taskId), 2000);
        }
      } else {
        this.setData({ isProcessing: false });
        util.showError('获取状态失败');
      }
    } catch (err) {
      this.setData({ isProcessing: false });
      console.error('轮询失败:', err);
      util.showError('网络错误');
    }
  },

  // 查看结果详情
  onViewResult() {
    const { result } = this.data;
    if (!result) return;

    // 保存到全局数据
    app.globalData.currentResult = result;

    wx.navigateTo({
      url: '/pages/detail/index'
    });
  },

  // 登录
  onLogin() {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        const userInfo = res.userInfo;
        this.setData({ userInfo });
        app.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);

        // 调用云函数保存用户信息
        wx.cloud.callFunction({
          name: 'getUserInfo',
          data: {
            action: 'update',
            userInfo
          }
        });
      },
      fail: () => {
        util.showToast('登录后可使用完整功能');
      }
    });
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '沙发换肤神器 - AI 图片融合',
      path: '/pages/index/index'
    };
  }
});

// 压缩图片用于 AI 处理 - 限制尺寸和质量
async function compressImageForAI(tempPath) {
  return new Promise((resolve, reject) => {
    // 先获取图片信息
    wx.getImageInfo({
      src: tempPath,
      success: (infoRes) => {
        const maxWidth = 1024;
        const maxHeight = 1024;
        let width = infoRes.width;
        let height = infoRes.height;

        // 计算压缩比例
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        // 使用 canvas 压缩
        compressImageWithCanvas(tempPath, width, height, 80)
          .then(resolve)
          .catch(reject);
      },
      fail: (err) => {
        // 如果获取信息失败，直接使用微信压缩
        util.compressImage(tempPath, 80)
          .then(resolve)
          .catch(reject);
      }
    });
  });
}

// 使用 canvas 压缩图片
async function compressImageWithCanvas(srcPath, width, height, quality) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .select('#hiddenCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          // 如果没有 canvas，使用普通压缩
          util.compressImage(srcPath, quality)
            .then(resolve)
            .catch(reject);
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        canvas.width = width;
        canvas.height = height;

        const img = canvas.createImage();
        img.src = srcPath;

        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height);
          wx.canvasToTempFilePath({
            canvas: canvas,
            fileType: 'jpg',
            quality: quality / 100,
            success: (res) => resolve(res.tempFilePath),
            fail: (err) => reject(err)
          });
        };

        img.onerror = (err) => reject(err);
      });
  });
}