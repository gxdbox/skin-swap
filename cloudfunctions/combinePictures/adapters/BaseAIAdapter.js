/**
 * AI 服务适配器基类
 * 所有 AI 厂商适配器都必须继承此类并实现其方法
 */
class BaseAIAdapter {
  /**
   * 构造函数
   * @param {Object} config - 配置对象，包含 API Key 等信息
   */
  constructor(config) {
    if (new.target === BaseAIAdapter) {
      throw new Error('BaseAIAdapter 是抽象类，不能直接实例化')
    }
    this.config = config
  }

  /**
   * 执行图像合成任务
   * @param {string} sofaImageUrl - 沙发图片 URL
   * @param {string} fabricImageUrl - 布料图片 URL
   * @returns {Promise<Object>} 返回标准化的结果对象 { imageUrl: string }
   */
  async combineImages(sofaImageUrl, fabricImageUrl) {
    throw new Error('子类必须实现 combineImages 方法')
  }

  /**
   * 获取适配器名称
   * @returns {string} 适配器名称
   */
  getName() {
    throw new Error('子类必须实现 getName 方法')
  }

  /**
   * 验证配置是否有效
   * @returns {boolean} 配置是否有效
   */
  validateConfig() {
    throw new Error('子类必须实现 validateConfig 方法')
  }
}

module.exports = BaseAIAdapter
