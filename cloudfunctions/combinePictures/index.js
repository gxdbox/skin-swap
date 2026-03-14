const cloud = require('wx-server-sdk')
const axios = require('axios')
const OpenAI = require('openai')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// Gemini API 配置
const GEMINI_API_KEY = 'sk-RCdyzeHPZpVD2z5IoGeyGytIRAP2VF7ah1zv7BplkZiHd0dl'
const GEMINI_BASE_URL = 'https://api.vectorengine.ai/v1'

// 初始化 OpenAI 客户端
const openai = new OpenAI({
  apiKey: GEMINI_API_KEY,
  baseURL: GEMINI_BASE_URL
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID

  try {
    const { sofaImageUrl, fabricImageUrl, action } = event

    // 查询任务状态
    if (action === 'getStatus') {
      const { taskId } = event

      try {
        const task = await db.collection('ai_tasks').doc(taskId).get()

        if (!task.data) {
          return { success: false, error: '任务不存在' }
        }

        const taskData = task.data

        return {
          success: true,
          status: taskData.status,
          resultImageUrl: taskData.resultImageUrl,
          error: taskData.error
        }
      } catch (err) {
        return { success: false, error: '任务不存在' }
      }
    }

    // 创建新任务
    if (!sofaImageUrl || !fabricImageUrl) {
      return {
        success: false,
        error: '请提供沙发图片和布料图片的URL'
      }
    }

    console.log('创建AI图像合成任务...')
    console.log('用户ID:', userId)
    console.log('沙发图片:', sofaImageUrl)
    console.log('布料图片:', fabricImageUrl)

    // 创建任务记录
    const taskResult = await db.collection('ai_tasks').add({
      data: {
        status: 'processing',
        sofaImageUrl,
        fabricImageUrl,
        userId,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    })

    const taskId = taskResult._id
    console.log('任务已创建:', taskId)

    // 异步执行合成任务
    processImageCombine(taskId, sofaImageUrl, fabricImageUrl, userId).catch(err => {
      console.error('异步任务执行失败:', err)
    })

    return {
      success: true,
      taskId: taskId,
      status: 'processing',
      message: '任务已创建，正在处理中...'
    }

  } catch (error) {
    console.error('combinePictures error:', error)
    return {
      success: false,
      error: error.message || '图像合成失败',
      details: error.response?.data || error.toString()
    }
  }
}

// 异步处理图像合成任务
async function processImageCombine(taskId, sofaImageUrl, fabricImageUrl, userId) {
  try {
    console.log(`开始处理任务 ${taskId}`)

    // 获取云存储文件的临时下载链接
    const [sofaTempUrl, fabricTempUrl] = await Promise.all([
      getFileDownloadUrl(sofaImageUrl),
      getFileDownloadUrl(fabricImageUrl)
    ])

    console.log('已获取临时URL')

    // 下载图片并转换为 base64
    const [sofaBase64, fabricBase64] = await Promise.all([
      downloadAndConvertToBase64(sofaTempUrl),
      downloadAndConvertToBase64(fabricTempUrl)
    ])

    console.log('图片已转换为 base64 格式')

    // 调用 Gemini Flash API 进行图像合成
    const result = await callGeminiImageCombine(sofaBase64, fabricBase64)

    // 更新任务状态为完成
    await db.collection('ai_tasks').doc(taskId).update({
      data: {
        status: 'completed',
        resultImageUrl: result.imageUrl,
        updatedAt: db.serverDate(),
        completedAt: db.serverDate()
      }
    })

    // 保存到历史记录
    await db.collection('fusion_history').add({
      data: {
        userId,
        sofaImage: sofaImageUrl,
        fabricImage: fabricImageUrl,
        resultImage: result.imageUrl,
        taskId,
        createdAt: db.serverDate()
      }
    })

    // 更新用户合成次数
    await updateUserFusionCount(userId)

    console.log(`任务 ${taskId} 完成`)

  } catch (error) {
    console.error(`任务 ${taskId} 失败:`, error)

    // 更新任务状态为失败
    await db.collection('ai_tasks').doc(taskId).update({
      data: {
        status: 'failed',
        error: error.message,
        updatedAt: db.serverDate()
      }
    })
  }
}

// 更新用户合成次数
async function updateUserFusionCount(userId) {
  try {
    const userRecord = await db.collection('users').where({
      openid: userId
    }).get()

    if (userRecord.data.length > 0) {
      await db.collection('users').doc(userRecord.data[0]._id).update({
        data: {
          fusionCount: db.command.inc(1),
          updatedAt: db.serverDate()
        }
      })
    }
  } catch (err) {
    console.error('更新用户统计失败:', err)
  }
}

// 获取云存储文件的临时下载链接
async function getFileDownloadUrl(fileID) {
  try {
    // 如果是HTTP URL，直接返回
    if (fileID.startsWith('http')) {
      return fileID
    }

    const result = await cloud.getTempFileURL({
      fileList: [fileID]
    })

    if (result.fileList && result.fileList.length > 0) {
      return result.fileList[0].tempFileURL
    }

    throw new Error('无法获取文件临时链接')
  } catch (error) {
    console.error('获取临时链接失败:', error)
    throw new Error(`获取文件链接失败: ${error.message}`)
  }
}

// 下载图片并转换为 base64
async function downloadAndConvertToBase64(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    const base64 = Buffer.from(response.data).toString('base64')
    const mimeType = response.headers['content-type'] || 'image/jpeg'

    return `data:${mimeType};base64,${base64}`
  } catch (error) {
    console.error('下载图片失败:', error)
    throw new Error(`下载图片失败: ${error.message}`)
  }
}

// Gemini Flash AI 图像合成函数
async function callGeminiImageCombine(sofaImageUrl, fabricImageUrl) {
  try {
    const prompt = `Apply the fabric pattern and texture from the second image to the sofa in the first image. The sofa should maintain its original shape and structure, but the fabric color and pattern should be replaced with the new fabric texture from the second image. Make it look realistic and professional. Generate only the modified sofa image.`

    console.log('调用 Gemini Flash API...')

    const startTime = Date.now()
    const response = await openai.chat.completions.create({
      model: 'gemini-3.1-flash-image-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: sofaImageUrl }
            },
            {
              type: 'image_url',
              image_url: { url: fabricImageUrl }
            }
          ]
        }
      ],
      max_tokens: 4096
    })

    const duration = Date.now() - startTime
    console.log(`Gemini API 响应成功，耗时: ${duration}ms`)

    if (!response.choices || response.choices.length === 0) {
      throw new Error('未生成响应')
    }

    const content = response.choices[0].message.content

    if (!content) {
      throw new Error('响应内容为空')
    }

    // 提取图片 URL 或 base64 数据
    let imageUrl = ''

    // 检查是否有直接的 URL
    const urlMatch = content.match(/https?:\/\/[^\s)]+/)
    if (urlMatch) {
      imageUrl = urlMatch[0]
      console.log('找到直接 URL:', imageUrl)
      return { imageUrl }
    }

    // 检查是否有 base64 数据
    if (content.includes('base64')) {
      console.log('找到 base64 数据，保存到云存储...')

      let base64Data = ''

      const base64Match = content.match(/data:image\/([^;]+);base64,([A-Za-z0-9+/=]+)/)
      if (base64Match) {
        base64Data = base64Match[2]
      } else {
        const pureBase64Match = content.match(/[A-Za-z0-9+/]{100,}={0,2}/)
        if (pureBase64Match) {
          base64Data = pureBase64Match[0]
        }
      }

      if (base64Data) {
        const buffer = Buffer.from(base64Data, 'base64')
        const timestamp = Date.now()
        const uploadResult = await cloud.uploadFile({
          cloudPath: `ai-combined/${timestamp}-gemini.png`,
          fileContent: buffer
        })

        console.log('图片已保存到云存储:', uploadResult.fileID)
        return { imageUrl: uploadResult.fileID }
      }
    }

    throw new Error(`未找到图片数据。响应内容: ${content.substring(0, 200)}`)

  } catch (error) {
    console.error('Gemini API 调用失败:', error.message)

    if (error.response) {
      const status = error.response.status
      if (status === 401) {
        throw new Error('认证失败：API Key 无效')
      } else if (status === 429) {
        throw new Error('请求过于频繁，请稍后再试')
      } else {
        throw new Error(`API 错误 (${status}): ${error.response.data?.error || error.message}`)
      }
    }

    if (error.code === 'ECONNABORTED') {
      throw new Error('请求超时，图片生成耗时过长')
    }

    throw error
  }
}