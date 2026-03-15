const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 阿里云 Wan2.5 API 配置
const DASHSCOPE_API_KEY = 'sk-d3d41e9bdca04039b04242af5249fb0b'
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1'

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID

  console.log('========== combinePictures 云函数开始执行 ==========')
  console.log('事件数据:', JSON.stringify(event))
  console.log('用户ID:', userId)

  try {
    const { sofaImageUrl, fabricImageUrl, action } = event

    // 查询任务状态
    if (action === 'getStatus') {
      console.log('执行 getStatus 操作')
      const { taskId } = event

      try {
        console.log('查询任务ID:', taskId)
        const task = await db.collection('ai_tasks').doc(taskId).get()

        if (!task.data) {
          console.log('任务不存在:', taskId)
          return { success: false, error: '任务不存在' }
        }

        const taskData = task.data
        console.log('任务数据:', JSON.stringify(taskData))

        return {
          success: true,
          status: taskData.status,
          resultImageUrl: taskData.resultImageUrl,
          error: taskData.error
        }
      } catch (err) {
        console.error('查询任务失败:', err)
        return { success: false, error: '任务不存在' }
      }
    }

    // 创建新任务
    console.log('执行图像合成操作')
    if (!sofaImageUrl || !fabricImageUrl) {
      console.error('缺少必要参数 - sofaImageUrl:', sofaImageUrl, 'fabricImageUrl:', fabricImageUrl)
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
    console.log('正在创建任务记录...')
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
    console.log('启动异步处理任务...')
    processImageCombine(taskId, sofaImageUrl, fabricImageUrl, userId).catch(err => {
      console.error('异步任务执行失败:', err)
    })

    console.log('========== combinePictures 云函数执行完成 ==========')
    return {
      success: true,
      taskId: taskId,
      status: 'processing',
      message: '任务已创建，正在处理中...'
    }

  } catch (error) {
    console.error('========== combinePictures 云函数异常 ==========')
    console.error('错误信息:', error.message)
    console.error('错误堆栈:', error.stack)
    console.error('完整错误:', JSON.stringify(error))
    return {
      success: false,
      error: error.message || '图像合成失败',
      details: error.response?.data || error.toString()
    }
  }
}

// 异步处理图像合成任务
async function processImageCombine(taskId, sofaImageUrl, fabricImageUrl, userId) {
  console.log(`========== 开始处理任务 ${taskId} ==========`)
  try {
    console.log(`任务ID: ${taskId}`)
    console.log(`沙发图片URL: ${sofaImageUrl}`)
    console.log(`布料图片URL: ${fabricImageUrl}`)

    // 获取云存储文件的临时下载链接
    console.log('正在获取临时下载链接...')
    const [sofaTempUrl, fabricTempUrl] = await Promise.all([
      getFileDownloadUrl(sofaImageUrl),
      getFileDownloadUrl(fabricImageUrl)
    ])

    console.log('已获取临时URL:')
    console.log('沙发临时URL:', sofaTempUrl)
    console.log('布料临时URL:', fabricTempUrl)

    // 调用 Qwen 图像编辑 API 进行图像合成
    console.log('正在调用 Qwen 图像编辑 API...')
    const result = await callQwenImageEdit(sofaTempUrl, fabricTempUrl)

    console.log('API 调用结果:', JSON.stringify(result))

    // 如果是异步任务，需要轮询结果
    if (result.isAsync && result.taskId) {
      console.log('异步任务已提交，Task ID:', result.taskId)
      console.log('开始轮询结果...')
      await pollWan25TaskResult(taskId, result.taskId, userId, sofaImageUrl, fabricImageUrl)
    } else if (result.imageUrl) {
      // 同步返回结果
      console.log('同步返回结果，图片URL:', result.imageUrl)
      await saveTaskResult(taskId, result.imageUrl, userId, sofaImageUrl, fabricImageUrl)
    } else {
      throw new Error('未获取到有效的结果')
    }

    console.log(`========== 任务 ${taskId} 处理完成 ==========`)

  } catch (error) {
    console.error(`========== 任务 ${taskId} 处理失败 ==========`)
    console.error('错误信息:', error.message)
    console.error('错误堆栈:', error.stack)
    console.error('完整错误:', JSON.stringify(error))

    // 更新任务状态为失败
    try {
      await db.collection('ai_tasks').doc(taskId).update({
        data: {
          status: 'failed',
          error: error.message,
          updatedAt: db.serverDate()
        }
      })
      console.log('任务状态已更新为失败')
    } catch (updateError) {
      console.error('更新任务状态失败:', updateError)
    }
  }
}

// 轮询 Wan2.5 任务结果
async function pollWan25TaskResult(taskId, wan25TaskId, userId, sofaImageUrl, fabricImageUrl, maxAttempts = 60) {
  let attempts = 0
  const pollInterval = 2000 // 2 秒轮询一次

  const poll = async () => {
    try {
      attempts++
      console.log(`轮询第 ${attempts} 次，Wan2.5 Task ID: ${wan25TaskId}`)

      const result = await queryWan25TaskResult(wan25TaskId)

      if (result.success && result.imageUrl) {
        console.log('任务完成，保存结果...')
        await saveTaskResult(taskId, result.imageUrl, userId, sofaImageUrl, fabricImageUrl)
        return
      }

      if (result.status === 'failed') {
        throw new Error(result.error || '任务执行失败')
      }

      if (result.status === 'processing' && attempts < maxAttempts) {
        // 继续轮询
        setTimeout(poll, pollInterval)
      } else if (attempts >= maxAttempts) {
        throw new Error('任务超时，请稍后重试')
      }

    } catch (error) {
      console.error('轮询失败:', error)
      await db.collection('ai_tasks').doc(taskId).update({
        data: {
          status: 'failed',
          error: error.message,
          updatedAt: db.serverDate()
        }
      })
    }
  }

  poll()
}

// 保存任务结果
async function saveTaskResult(taskId, resultImageUrl, userId, sofaImageUrl, fabricImageUrl) {
  try {
    // 更新任务状态为完成
    await db.collection('ai_tasks').doc(taskId).update({
      data: {
        status: 'completed',
        resultImageUrl: resultImageUrl,
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
        resultImage: resultImageUrl,
        taskId,
        createdAt: db.serverDate()
      }
    })

    // 更新用户合成次数
    await updateUserFusionCount(userId)

    console.log(`任务 ${taskId} 完成`)
  } catch (error) {
    console.error('保存结果失败:', error)
    throw error
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

// 阿里云 Qwen 图像编辑 API - 多图融合
async function callQwenImageEdit(sofaImageUrl, fabricImageUrl) {
  console.log('========== 调用 Qwen 图像编辑 API ==========')
  try {
    const prompt = '将第二张图片中的布料纹理和颜色应用到第一张图片中的沙发上。沙发应保持原始形状和结构，但布料颜色和纹理应替换为新布料纹理。生成逼真、专业的效果。'

    console.log('API Key:', DASHSCOPE_API_KEY ? '已配置' : '未配置')
    console.log('API Base URL:', DASHSCOPE_BASE_URL)
    console.log('沙发图片URL:', sofaImageUrl)
    console.log('布料图片URL:', fabricImageUrl)

    // 使用正确的请求格式：messages 格式
    const requestBody = {
      model: 'qwen-image-2.0-pro',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              {
                image: sofaImageUrl
              },
              {
                image: fabricImageUrl
              },
              {
                text: prompt
              }
            ]
          }
        ]
      },
      parameters: {
        n: 1
      }
    }

    console.log('请求体:', JSON.stringify(requestBody, null, 2))

    const headers = {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    }

    console.log('请求头:', JSON.stringify(headers))
    console.log('请求URL:', `${DASHSCOPE_BASE_URL}/services/aigc/multimodal-generation/generation`)

    const startTime = Date.now()
    let response
    try {
      response = await axios.post(
        `${DASHSCOPE_BASE_URL}/services/aigc/multimodal-generation/generation`,
        requestBody,
        {
          headers: headers,
          timeout: 60000
        }
      )
    } catch (axiosError) {
      console.error('Axios 请求失败')
      console.error('错误代码:', axiosError.code)
      console.error('错误信息:', axiosError.message)
      if (axiosError.response) {
        console.error('HTTP 状态:', axiosError.response.status)
        console.error('响应数据:', JSON.stringify(axiosError.response.data))
      }
      throw axiosError
    }

    const duration = Date.now() - startTime
    console.log(`Qwen API 响应成功，耗时: ${duration}ms`)
    console.log('响应状态码:', response.status)
    console.log('响应数据:', JSON.stringify(response.data, null, 2))

    if (!response.data) {
      console.error('响应数据为空')
      throw new Error('API 响应为空')
    }

    const output = response.data.output
    
    if (!output) {
      console.error('输出字段不存在，完整响应:', JSON.stringify(response.data))
      throw new Error('API 响应中没有 output 字段')
    }

    // 检查是否有生成结果
    if (output.choices && output.choices.length > 0) {
      const choice = output.choices[0]
      if (choice.message && choice.message.content && choice.message.content.length > 0) {
        const content = choice.message.content[0]
        if (content.image) {
          console.log('图片生成成功:', content.image)
          return { imageUrl: content.image, isAsync: false }
        }
      }
    }

    console.error('未获取到预期结果，输出内容:', JSON.stringify(output))
    throw new Error('未获取到生成结果')

  } catch (error) {
    console.error('========== Qwen API 调用失败 ==========')
    console.error('错误类型:', error.constructor.name)
    console.error('错误信息:', error.message)
    console.error('错误堆栈:', error.stack)
    console.error('完整错误:', JSON.stringify(error, null, 2))

    throw error
  }
}

// 查询 Wan2.5 异步任务结果
async function queryWan25TaskResult(taskId) {
  try {
    console.log('查询任务结果，Task ID:', taskId)

    const response = await axios.get(
      `${DASHSCOPE_BASE_URL}/services/aigc/image2image/image-synthesis`,
      {
        params: {
          task_id: taskId
        },
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )

    if (!response.data || !response.data.output) {
      throw new Error('查询响应格式错误')
    }

    const output = response.data.output
    const status = output.task_status

    console.log('任务状态:', status)

    if (status === 'SUCCEEDED') {
      if (output.results && output.results.length > 0) {
        const imageUrl = output.results[0].url
        console.log('任务完成，图片 URL:', imageUrl)
        return { success: true, imageUrl, status: 'completed' }
      }
      throw new Error('任务成功但未获取到结果')
    } else if (status === 'FAILED') {
      const errorMsg = output.message || '任务执行失败'
      console.error('任务失败:', errorMsg)
      return { success: false, error: errorMsg, status: 'failed' }
    } else if (status === 'PROCESSING') {
      console.log('任务处理中...')
      return { success: false, status: 'processing' }
    } else {
      return { success: false, status: status }
    }

  } catch (error) {
    console.error('查询任务失败:', error.message)
    throw error
  }
}