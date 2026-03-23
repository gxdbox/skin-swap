/**
 * AI 服务配置文件
 * 在这里配置不同的 AI 厂商和切换当前使用的厂商
 */

const AI_PROVIDERS = {
  FAL_AI: {
    name: 'FAL.ai',
    apiKey: 'e5bddc6d-f691-4c13-9c35-b792f3edc5d2:75988597b9f8182b8267e01570cbb9cf',
    endpoint: 'fal-ai/flux-2/edit'
  },
  
  // 示例：添加其他厂商配置
  // OPENAI: {
  //   name: 'OpenAI',
  //   apiKey: 'your-openai-api-key',
  //   baseUrl: 'https://api.openai.com/v1',
  //   model: 'dall-e-3'
  // },
  
  // STABILITY_AI: {
  //   name: 'Stability AI',
  //   apiKey: 'your-stability-api-key',
  //   baseUrl: 'https://api.stability.ai/v1',
  //   engine: 'stable-diffusion-xl-1024-v1-0'
  // }
}

// 当前使用的 AI 厂商（只需修改这里即可切换厂商）
const CURRENT_PROVIDER = 'FAL_AI'

module.exports = {
  AI_PROVIDERS,
  CURRENT_PROVIDER,
  getCurrentConfig: () => AI_PROVIDERS[CURRENT_PROVIDER]
}
