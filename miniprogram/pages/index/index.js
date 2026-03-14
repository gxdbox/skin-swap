// pages/index/index.js
const util = require('../../utils/util.js');
const app = getApp();

Page({
  data: {
    // 沙发图片
    sofaImage: '',
    sofaFileId: '',
    // 布料列表 (使用在线示例图片)
    fabrics: [
      { id: 1, name: '米色花纹', image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=200&fit=crop', selected: false },
      { id: 2, name: '蓝色条纹', image: 'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200&h=200&fit=crop', selected: false },
      { id: 3, name: '灰色纯色', image: 'https://images.unsplash.com/photo-1567016432779-094069958ea5?w=200&h=200&fit=crop', selected: false },
      { id: 4, name: '绿色格子', image: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=200&h=200&fit=crop', selected: false }
    ],
    // 自定义布料
    customFabric: '',
    customFabricFileId: '',
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

      // 压缩图片
      const compressedPath = await util.compressImage(tempPath, 80);

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

  // 选择预设布料
  onSelectFabric(e) {
    const { id } = e.currentTarget.dataset;
    const fabrics = this.data.fabrics.map(f => ({
      ...f,
      selected: f.id === id
    }));

    // 清除自定义布料选择
    this.setData({
      fabrics,
      customFabric: '',
      customFabricFileId: ''
    });
  },

  // 上传自定义布料
  async onUploadFabric() {
    try {
      const tempFiles = await util.chooseImage(1);
      const tempPath = tempFiles[0];

      util.showLoading('上传中...');

      // 压缩图片
      const compressedPath = await util.compressImage(tempPath, 80);

      // 上传到云存储
      const cloudPath = util.generateCloudPath(app.globalData.openid || 'anonymous', 'fabric');
      const fileId = await util.uploadFile(compressedPath, cloudPath);

      // 取消预设布料选择
      const fabrics = this.data.fabrics.map(f => ({ ...f, selected: false }));

      this.setData({
        customFabric: compressedPath,
        customFabricFileId: fileId,
        fabrics
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
  onDeleteCustomFabric() {
    this.setData({
      customFabric: '',
      customFabricFileId: ''
    });
  },

  // 开始合成
  async onStartFuse() {
    const { sofaImage, sofaFileId, fabrics, customFabric, customFabricFileId } = this.data;

    // 验证
    if (!sofaImage) {
      util.showToast('请先上传沙发图片');
      return;
    }

    const selectedFabric = fabrics.find(f => f.selected);
    if (!selectedFabric && !customFabric) {
      util.showToast('请选择或上传布料');
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

      // 获取布料图片URL
      let fabricUrl = '';
      let fabricFileId = '';

      if (customFabric) {
        fabricUrl = customFabric;
        fabricFileId = customFabricFileId;
      } else if (selectedFabric) {
        fabricUrl = selectedFabric.image;
        // 预设布料使用本地路径
      }

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
              fabricImage: this.data.customFabric || this.data.fabrics.find(f => f.selected)?.image,
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
      title: '沙发换肤神器 - AI图片融合',
      path: '/pages/index/index'
    };
  }
});