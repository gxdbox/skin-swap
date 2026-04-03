const BaseAIAdapter = require('./BaseAIAdapter')
const axios = require('axios')

/**
 * FAL.ai 适配器
 * 实现 FAL.ai 的图像合成功能
 */
class FalAiAdapter extends BaseAIAdapter {
  constructor(config) {
    super(config)
    this.apiKey = config.apiKey
    this.baseUrl = 'https://queue.fal.run'
    this.endpoint = config.endpoint || 'fal-ai/flux-2/edit'
    this.maxPollAttempts = 60  // 优化：从 120 减少到 60
    this.pollInterval = 1500   // 优化：从 2000ms 减少到 1500ms
  }

  getName() {
    return 'FAL.ai'
  }

  validateConfig() {
    if (!this.apiKey) {
      throw new Error('FAL.ai API Key 未配置')
    }
    return true
  }

  /**
   * 执行图像合成
   */
  async combineImages(sofaImageUrl, fabricImageUrl) {
    this.validateConfig()

    const prompt = `Replace the sofa fabric with the texture and pattern from the second image. Keep the sofa shape and structure exactly the same, only change the fabric texture and color to match the reference. Make it look realistic and professional.`

    console.log('========== FAL.ai API 调用开始 ==========')
    console.log('API Key (前10位):', this.apiKey.substring(0, 10) + '...')
    console.log('Endpoint:', this.endpoint)
    console.log('沙发图片URL:', sofaImageUrl)
    console.log('布料图片URL:', fabricImageUrl)

    try {
      const submitUrl = `${this.baseUrl}/${this.endpoint}`
      const requestBody = {
        prompt,
        image_urls: [sofaImageUrl, fabricImageUrl]
      }

      console.log('请求URL:', submitUrl)
      console.log('请求Body:', JSON.stringify(requestBody, null, 2))

      const submitResponse = await axios.post(
        submitUrl,
        requestBody,
        {
          headers: {
            'Authorization': `Key ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      )

      console.log('FAL.ai 提交成功，状态码:', submitResponse.status)
      console.log('FAL.ai 提交响应:', JSON.stringify(submitResponse.data, null, 2))

      const requestId = submitResponse.data.request_id
      const responseUrl = submitResponse.data.response_url

      if (!requestId || !responseUrl) {
        throw new Error('FAL.ai 未返回 request_id 或 response_url')
      }

      console.log('FAL.ai 任务已提交, request_id:', requestId)

      const imageUrl = await this._pollResult(requestId, responseUrl)

      return { imageUrl }

    } catch (error) {
      console.error('========== FAL.ai API 调用失败 ==========')
      console.error('错误类型:', error.constructor.name)
      console.error('错误消息:', error.message)

      if (error.response) {
        const status = error.response.status
        const errorData = error.response.data
        console.error('HTTP 状态码:', status)
        console.error('错误响应数据:', JSON.stringify(errorData, null, 2))

        if (status === 401) {
          throw new Error('FAL.ai 认证失败：API Key 无效')
        } else if (status === 422) {
          const detail = errorData?.detail || errorData?.error || JSON.stringify(errorData)
          console.error('422 验证错误详情:', detail)
          throw new Error(`FAL.ai 参数验证失败 (422): ${detail}`)
        } else if (status === 402 || status === 403) {
          throw new Error(`FAL.ai 配额不足或权限问题: ${errorData?.detail || error.message}`)
        } else if (status === 429) {
          throw new Error('FAL.ai 请求过于频繁，请稍后再试')
        } else {
          throw new Error(`FAL.ai API 错误 (${status}): ${errorData?.detail || error.message}`)
        }
      }

      if (error.code === 'ECONNABORTED') {
        throw new Error('FAL.ai 请求超时')
      }

      throw error
    }
  }

  /**
   * 轮询获取结果（私有方法）
   */
  async _pollResult(requestId, responseUrl) {
    console.log('开始轮询 FAL.ai 结果...')
    console.log('轮询 URL:', responseUrl)

    for (let attempts = 1; attempts <= this.maxPollAttempts; attempts++) {
      try {
        console.log(`轮询第 ${attempts} 次...`)

        const response = await axios.get(
          responseUrl,
          {
            headers: {
              'Authorization': `Key ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        )

        const data = response.data
        console.log('响应状态:', response.status)
        console.log('响应数据:', JSON.stringify(data, null, 2))

        let imageUrl = null

        if (data.images && data.images.length > 0) {
          imageUrl = data.images[0].url
        } else if (data.result && data.result.images && data.result.images.length > 0) {
          imageUrl = data.result.images[0].url
        }

        if (imageUrl) {
          console.log('✓ 任务完成，图片URL:', imageUrl)
          return imageUrl
        }

        const status = data.status
        console.log('任务状态:', status)

        if (status === 'COMPLETED') {
          if (data.result) {
            console.log('任务完成，result:', JSON.stringify(data.result, null, 2))
            if (data.result.images && data.result.images.length > 0) {
              return data.result.images[0].url
            }
          }
          throw new Error('任务完成但未获取到图片')
        }

        if (status === 'FAILED') {
          throw new Error(`FAL.ai 任务失败: ${data.error || '未知错误'}`)
        }

        if (status === 'IN_PROGRESS' || status === 'IN_QUEUE') {
          await new Promise(resolve => setTimeout(resolve, this.pollInterval))
          continue
        }

        await new Promise(resolve => setTimeout(resolve, this.pollInterval))

      } catch (err) {
        // 处理 400 错误 - 任务仍在进行中
        if (err.response && err.response.status === 400) {
          const errorMsg = err.response.data?.detail || err.response.data?.error || err.message
          console.log('任务仍在进行中:', errorMsg)
          await new Promise(resolve => setTimeout(resolve, this.pollInterval))
          continue
        }

        if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET') {
          console.log('网络错误，重试...')
          await new Promise(resolve => setTimeout(resolve, this.pollInterval))
          continue
        }

        throw err
      }
    }

    throw new Error('FAL.ai 任务超时')
  }
}

module.exports = FalAiAdapter
