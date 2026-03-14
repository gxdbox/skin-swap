/**
 * 通用工具函数
 */

/**
 * 格式化日期
 * @param {Date|string|number} date 日期对象、字符串或时间戳
 * @param {string} format 格式化模板，默认 'YYYY-MM-DD HH:mm'
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date, format = 'YYYY-MM-DD HH:mm') {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 格式化相对时间
 * @param {Date|string|number} date 日期
 * @returns {string} 相对时间描述
 */
function formatRelativeTime(date) {
  if (!date) return '';

  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return formatDate(date, 'MM-DD HH:mm');
}

/**
 * 压缩图片
 * @param {string} filePath 图片临时路径
 * @param {number} quality 压缩质量 0-100
 * @returns {Promise<string>} 压缩后的临时路径
 */
function compressImage(filePath, quality = 80) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality: quality,
      success: (res) => {
        resolve(res.tempFilePath);
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 选择图片
 * @param {number} count 最多可选择图片数量
 * @returns {Promise<Array<string>>} 选择的图片临时路径数组
 */
function chooseImage(count = 1) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles.map(file => file.tempFilePath);
        resolve(tempFiles);
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 上传文件到云存储
 * @param {string} filePath 本地文件路径
 * @param {string} cloudPath 云存储路径
 * @returns {Promise<string>} 云存储文件ID
 */
function uploadFile(filePath, cloudPath) {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: (res) => {
        resolve(res.fileID);
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 获取云存储临时URL
 * @param {string} fileID 云存储文件ID
 * @returns {Promise<string>} 临时访问URL
 */
function getTempFileURL(fileID) {
  return new Promise((resolve, reject) => {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        if (res.fileList && res.fileList.length > 0) {
          resolve(res.fileList[0].tempFileURL);
        } else {
          reject(new Error('获取临时URL失败'));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 生成云存储路径
 * @param {string} userId 用户ID
 * @param {string} type 文件类型
 * @returns {string} 云存储路径
 */
function generateCloudPath(userId, type) {
  const date = formatDate(new Date(), 'YYYY/MM/DD');
  const id = generateId();
  return `${type}/${userId}/${date}/${id}.jpg`;
}

/**
 * 显示加载提示
 * @param {string} title 提示文字
 */
function showLoading(title = '加载中...') {
  wx.showLoading({
    title: title,
    mask: true
  });
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  wx.hideLoading();
}

/**
 * 显示成功提示
 * @param {string} title 提示文字
 */
function showSuccess(title) {
  wx.showToast({
    title: title,
    icon: 'success',
    duration: 2000
  });
}

/**
 * 显示错误提示
 * @param {string} title 提示文字
 */
function showError(title) {
  wx.showToast({
    title: title,
    icon: 'error',
    duration: 2000
  });
}

/**
 * 显示普通提示
 * @param {string} title 提示文字
 */
function showToast(title) {
  wx.showToast({
    title: title,
    icon: 'none',
    duration: 2000
  });
}

/**
 * 防抖函数
 * @param {Function} fn 要防抖的函数
 * @param {number} delay 延迟时间
 * @returns {Function} 防抖后的函数
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * 节流函数
 * @param {Function} fn 要节流的函数
 * @param {number} delay 间隔时间
 * @returns {Function} 节流后的函数
 */
function throttle(fn, delay = 300) {
  let last = 0;
  return function(...args) {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn.apply(this, args);
    }
  };
}

module.exports = {
  formatDate,
  formatRelativeTime,
  compressImage,
  chooseImage,
  uploadFile,
  getTempFileURL,
  generateId,
  generateCloudPath,
  showLoading,
  hideLoading,
  showSuccess,
  showError,
  showToast,
  debounce,
  throttle
};