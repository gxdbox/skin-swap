const BaseAIAdapter = require('./BaseAIAdapter')
const axios = require('axios')

/**
 * 示例适配器 - 展示如何实现新的 AI 厂商适配器
 * 
 * 使用步骤：
 * 1. 继承 BaseAIAdapter 基类
 * 2. 实现必需的方法：getName(), validateConfig(), combineImages()
 * 3. 在 aiConfig.js 中添加配置
 * 4. 在 AIAdapterFactory.js 中注册适配器
 */
class ExampleAdapter extends BaseAIAdapter {
  constructor(config) {
    super(config)
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl
    this.model = config.model
  }

  /**
   * 返回适配器名称
   */
  getName() {
    return 'Example AI Provider'
  }

  /**
   * 验证配置
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('Example AI API Key 未配置')
    }
    if (!this.baseUrl) {
      throw new Error('Example AI Base URL 未配置')
    }
    return true
  }

  /**
   * 执行图像合成
   * @param {string} sofaImageUrl - 沙发图片 URL
   * @param {string} fabricImageUrl - 布料图片 URL
   * @returns {Promise<Object>} 返回 { imageUrl: string }
   */
  async combineImages(sofaImageUrl, fabricImageUrl) {
    this.validateConfig()

    console.log('========== Example AI API 调用开始 ==========')
    console.log('沙发图片:', sofaImageUrl)
    console.log('布料图片:', fabricImageUrl)

    try {
      // 示例：调用 AI 服务 API
      const response = await axios.post(
        `${this.baseUrl}/your-endpoint`,
        {
          model: this.model,
          sofa_image: sofaImageUrl,
          fabric_image: fabricImageUrl,
          // 其他参数...
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      )

      console.log('API 响应:', response.data)

      // 根据实际 API 响应结构提取图片 URL
      const imageUrl = response.data.result?.image_url || response.data.image_url

      if (!imageUrl) {
        throw new Error('未获取到生成的图片 URL')
      }

      return { imageUrl }

    } catch (error) {
      console.error('========== Example AI API 调用失败 ==========')
      console.error('错误:', error.message)

      if (error.response) {
        const status = error.response.status
        const errorData = error.response.data

        if (status === 401) {
          throw new Error('Example AI 认证失败：API Key 无效')
        } else if (status === 429) {
          throw new Error('Example AI 请求过于频繁')
        } else {
          throw new Error(`Example AI API 错误 (${status}): ${errorData?.message || error.message}`)
        }
      }

      throw error
    }
  }
}

module.exports = ExampleAdapter
