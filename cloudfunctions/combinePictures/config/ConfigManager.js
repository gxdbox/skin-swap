const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/**
 * 配置管理器
 * 从云数据库读取配置信息
 */
class ConfigManager {
  constructor() {
    this.configCache = null
    this.cacheTime = null
    this.cacheDuration = 5 * 60 * 1000 // 缓存5分钟
  }

  /**
   * 从云数据库获取 AI 配置
   * @returns {Promise<Object>} AI 配置对象
   */
  async getAIConfig() {
    // 检查缓存是否有效
    if (this.configCache && this.cacheTime && (Date.now() - this.cacheTime < this.cacheDuration)) {
      console.log('使用缓存的配置')
      return this.configCache
    }

    try {
      console.log('从云数据库读取配置...')
      
      // 从 ai_config 集合读取配置
      const result = await db.collection('ai_config').where({
        active: true
      }).get()

      if (!result.data || result.data.length === 0) {
        throw new Error('未找到有效的 AI 配置，请在云数据库 ai_config 集合中添加配置')
      }

      const config = result.data[0]
      console.log('成功读取配置:', { 
        provider: config.provider,
        endpoint: config.endpoint,
        hasApiKey: !!config.apiKey 
      })

      // 构建配置对象
      const aiConfig = {
        provider: config.provider || 'FAL_AI',
        name: config.name || 'FAL.ai',
        apiKey: config.apiKey,
        endpoint: config.endpoint || 'fal-ai/flux-2/edit'
      }

      // 更新缓存
      this.configCache = aiConfig
      this.cacheTime = Date.now()

      return aiConfig
    } catch (error) {
      console.error('读取配置失败:', error)
      
      // 如果数据库读取失败，使用本地配置作为后备
      console.log('使用本地后备配置')
      const fallbackConfig = require('./aiConfig')
      return fallbackConfig.AI_PROVIDERS[fallbackConfig.CURRENT_PROVIDER]
    }
  }

  /**
   * 清除配置缓存
   */
  clearCache() {
    this.configCache = null
    this.cacheTime = null
    console.log('配置缓存已清除')
  }
}

// 导出单例
module.exports = new ConfigManager()
