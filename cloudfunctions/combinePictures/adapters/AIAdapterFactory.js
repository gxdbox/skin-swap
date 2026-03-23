const FalAiAdapter = require('./FalAiAdapter')
const { AI_PROVIDERS, CURRENT_PROVIDER } = require('../config/aiConfig')

/**
 * AI 适配器工厂类
 * 根据配置创建对应的 AI 服务适配器实例
 */
class AIAdapterFactory {
  /**
   * 创建 AI 适配器实例
   * @param {string} providerName - 厂商名称，如果不传则使用配置文件中的默认厂商
   * @returns {BaseAIAdapter} AI 适配器实例
   */
  static createAdapter(providerName = null) {
    const provider = providerName || CURRENT_PROVIDER
    const config = AI_PROVIDERS[provider]
    
    if (!config) {
      throw new Error(`未找到 AI 厂商配置: ${provider}`)
    }

    console.log(`创建 AI 适配器: ${provider}`)
    console.log('配置:', { ...config, apiKey: config.apiKey ? '***' : undefined })

    switch (provider) {
      case 'FAL_AI':
        return new FalAiAdapter(config)
      
      // 添加其他厂商的适配器
      // case 'OPENAI':
      //   return new OpenAIAdapter(config)
      
      // case 'STABILITY_AI':
      //   return new StabilityAIAdapter(config)
      
      default:
        throw new Error(`不支持的 AI 厂商: ${provider}`)
    }
  }

  /**
   * 获取当前使用的厂商名称
   */
  static getCurrentProvider() {
    return CURRENT_PROVIDER
  }
}

module.exports = AIAdapterFactory
