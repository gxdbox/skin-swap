const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// FAL.ai 官方 API 配置
// 云函数无法读取 .env 文件，请在微信云开发控制台配置环境变量 FAL_API_KEY
// 或直接在此处填写你的 API Key
const FAL_API_KEY = process.env.FAL_API_KEY || 'ec5fdd28-3cee-492c-8f02-14840e358b0e:4be7af30e43d37efb4af6bb272aa7404'
const FAL_BASE_URL = 'https://queue.fal.run'
const FAL_MODEL = 'fal-ai/flux-pro/kontext'

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID

  console.log('========== combinePictures 云函数开始执行 ==========')
  console.log('事件数据:', JSON.stringify(event))
  console.log('用户ID:', userId)
  const functionStartTime = Date.now()

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

        // 如果任务还在处理中，且有 responseUrl，继续轮询 FAL.ai
        if (taskData.status === 'processing' && taskData.responseUrl) {
          console.log('任务处理中，继续轮询 FAL.ai...')
          try {
            const falResult = await pollFalAiForResult(taskData.responseUrl)
            if (falResult.imageUrl) {
              console.log('FAL.ai 任务完成，图片URL:', falResult.imageUrl)
              // 保存结果
              await saveTaskResult(taskId, falResult.imageUrl, taskData.userId, taskData.sofaImageUrl, taskData.fabricImageUrl)
              return {
                success: true,
                status: 'completed',
                resultImageUrl: falResult.imageUrl
              }
            } else if (falResult.failed) {
              // 任务失败
              console.log('FAL.ai 任务失败:', falResult.error)
              await db.collection('ai_tasks').doc(taskId).update({
                data: {
                  status: 'failed',
                  error: falResult.error || 'FAL.ai 任务失败',
                  updatedAt: db.serverDate()
                }
              })
              return {
                success: false,
                status: 'failed',
                error: falResult.error || 'FAL.ai 任务失败'
              }
            }
          } catch (pollError) {
            console.log('轮询 FAL.ai 失败:', pollError.message)
            // 继续返回 processing 状态
          }
        }

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

    // 异步执行合成任务（不等待，立即返回）
    console.log('启动异步处理任务...')
    // 注意：不使用 await，让函数在后台执行
    processImageCombine(taskId, sofaImageUrl, fabricImageUrl, userId)
      .then(() => {
        console.log(`任务 ${taskId} 异步处理完成`)
      })
      .catch(err => {
        console.error(`========== 任务 ${taskId} 异步处理失败 ==========`)
        console.error('错误信息:', err.message)
        console.error('错误堆栈:', err.stack)
        
        // 更新任务状态为失败
        db.collection('ai_tasks').doc(taskId).update({
          data: {
            status: 'failed',
            error: err.message,
            updatedAt: db.serverDate()
          }
        }).catch(updateErr => {
          console.error('更新任务失败状态失败:', updateErr)
        })
      })

    const functionDuration = Date.now() - functionStartTime
    console.log(`========== 主函数返回，任务 ${taskId} 在后台处理 ==========`)
    console.log(`主函数耗时: ${functionDuration}ms`)

    return {
      success: true,
      taskId: taskId,
      status: 'processing',
      duration: functionDuration,
      message: '任务已创建，正在后台处理中...'
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
  console.log(`========== [异步] 开始处理任务 ${taskId} ==========`)
  console.log(`[异步] 时间: ${new Date().toISOString()}`)
  try {
    console.log(`[异步] 任务ID: ${taskId}`)
    console.log(`[异步] 沙发图片URL: ${sofaImageUrl}`)
    console.log(`[异步] 布料图片URL: ${fabricImageUrl}`)

    // 获取云存储文件的临时下载链接
    console.log('[异步] 正在获取临时下载链接...')
    const [sofaTempUrl, fabricTempUrl] = await Promise.all([
      getFileDownloadUrl(sofaImageUrl),
      getFileDownloadUrl(fabricImageUrl)
    ])

    console.log('[异步] 已获取临时URL:')
    console.log('[异步] 沙发临时URL:', sofaTempUrl)
    console.log('[异步] 布料临时URL:', fabricTempUrl)

    // 调用 FAL.ai 官方 API 进行图像合成
    console.log('[异步] 正在调用 FAL.ai 官方 API...')
    const apiStartTime = Date.now()
    const result = await callFalAiApi(sofaTempUrl, fabricTempUrl)
    const apiDuration = Date.now() - apiStartTime
    console.log(`[异步] API 调用耗时: ${apiDuration}ms`)

    console.log('[异步] API 调用结果:', JSON.stringify(result))

    // FAL.ai 是异步任务，保存 responseUrl 到数据库，然后在 getStatus 时轮询
    if (result.requestId) {
      console.log('[异步] 异步任务已提交，Request ID:', result.requestId)
      console.log('[异步] Response URL:', result.responseUrl)

      // 保存 responseUrl 到数据库
      await db.collection('ai_tasks').doc(taskId).update({
        data: {
          responseUrl: result.responseUrl,
          requestId: result.requestId,
          updatedAt: db.serverDate()
        }
      })
      console.log('[异步] 已保存 responseUrl 到数据库')

      // 尝试轮询一次（如果很快完成可以立即返回结果）
      const pollStartTime = Date.now()
      try {
        await pollFalAiTaskResult(taskId, result.requestId, result.responseUrl, userId, sofaImageUrl, fabricImageUrl)
        const pollDuration = Date.now() - pollStartTime
        console.log(`[异步] 轮询耗时: ${pollDuration}ms`)
      } catch (pollError) {
        console.log('[异步] 轮询超时，将在 getStatus 时继续轮询')
      }
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

// FAL.ai 官方 API 图像编辑
async function callFalAiApi(sofaImageUrl, fabricImageUrl) {
  console.log('========== 调用 FAL.ai 官方 API ==========')
  try {
    const prompt = '将第二张图片中的布料纹理和颜色应用到第一张图片中的沙发上。沙发应保持原始形状和结构，但布料颜色和纹理应替换为新布料纹理。生成逼真、专业的效果。'

    console.log('FAL API Key:', FAL_API_KEY ? '已配置' : '未配置')
    console.log('FAL Base URL:', FAL_BASE_URL)
    console.log('FAL 模型:', FAL_MODEL)
    console.log('沙发图片URL:', sofaImageUrl)
    console.log('布料图片URL:', fabricImageUrl)

    // FAL.ai flux-pro/kontext API 请求格式
    // 参考: https://fal.ai/models/fal-ai/flux-pro/kontext/api
    // 重要: reference_image_url 是参考图片（布料纹理），image_url 是目标图片（沙发）
    const requestBody = {
      image_url: sofaImageUrl,
      reference_image_url: fabricImageUrl,  // 布料参考图 - 这是关键参数！
      prompt: prompt,
      num_images: 1,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      seed: Math.floor(Math.random() * 1000000)
    }

    console.log('请求体:', JSON.stringify(requestBody, null, 2))

    const headers = {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json'
    }

    // 使用 FAL.ai 官方队列 API 端点
    const requestUrl = `${FAL_BASE_URL}/${FAL_MODEL}`
    console.log('请求URL:', requestUrl)
    console.log('请求头:', JSON.stringify({ 'Authorization': 'Key ***', 'Content-Type': 'application/json' }))

    const startTime = Date.now()
    let response
    try {
      response = await axios.post(
        requestUrl,
        requestBody,
        {
          headers: headers,
          timeout: 120000
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
    console.log(`FAL.ai API 响应成功，耗时: ${duration}ms`)
    console.log('响应状态码:', response.status)
    console.log('响应数据:', JSON.stringify(response.data, null, 2))

    if (!response.data) {
      console.error('响应数据为空')
      throw new Error('API 响应为空')
    }

    const data = response.data

    // FAL.ai 队列 API 返回 request_id 用于后续查询
    if (data.request_id) {
      console.log('异步任务已提交，Request ID:', data.request_id)
      console.log('Response URL:', data.response_url)
      console.log('Status URL:', data.status_url)
      return {
        requestId: data.request_id,
        responseUrl: data.response_url,
        statusUrl: data.status_url,
        isAsync: true
      }
    }

    // 某些情况下可能直接返回结果
    if (data.images && data.images.length > 0) {
      console.log('同步返回结果，图片URL:', data.images[0].url)
      return { imageUrl: data.images[0].url, isAsync: false }
    }

    console.error('未获取到预期结果，响应内容:', JSON.stringify(data))
    throw new Error('未获取到有效的结果')

  } catch (error) {
    console.error('========== FAL.ai API 调用失败 ==========')
    console.error('错误类型:', error.constructor.name)
    console.error('错误信息:', error.message)
    console.error('错误堆栈:', error.stack)
    console.error('完整错误:', JSON.stringify(error, null, 2))

    throw error
  }
}

// 简单轮询 FAL.ai 结果（用于 getStatus 时调用）
async function pollFalAiForResult(responseUrl) {
  console.log('========== 查询 FAL.ai 结果 ==========')
  console.log('Response URL:', responseUrl)

  try {
    const response = await axios.get(responseUrl, {
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    })

    const data = response.data
    console.log('FAL.ai 响应状态:', response.status)
    console.log('FAL.ai 完整响应:', JSON.stringify(data, null, 2))

    // 任务完成时直接返回 images
    if (data.images && data.images.length > 0) {
      console.log('✓ 检测到 images 数组，任务完成')
      return { imageUrl: data.images[0].url, completed: true }
    }

    // 检查状态字段
    console.log('任务状态:', data.status)

    // COMPLETED 状态但可能 images 在其他位置
    if (data.status === 'COMPLETED') {
      // 检查可能的其他图片字段位置
      if (data.image) {
        console.log('✓ 检测到 image 字段，任务完成')
        return { imageUrl: data.image, completed: true }
      }
      if (data.result && data.result.image) {
        console.log('✓ 检测到 result.image 字段，任务完成')
        return { imageUrl: data.result.image, completed: true }
      }
      if (data.result && data.result.images && data.result.images.length > 0) {
        console.log('✓ 检测到 result.images 数组，任务完成')
        return { imageUrl: data.result.images[0], completed: true }
      }
      if (data.output && data.output.images && data.output.images.length > 0) {
        console.log('✓ 检测到 output.images 数组，任务完成')
        return { imageUrl: data.output.images[0].url || data.output.images[0], completed: true }
      }
      console.log('⚠ 状态为 COMPLETED 但未找到图片数据')
    }

    // 失败状态
    if (data.status === 'FAILED') {
      console.log('✗ 任务失败:', data.error || data.logs)
      return { completed: false, failed: true, error: data.error || data.logs }
    }

    return { completed: false }
  } catch (error) {
    // 400 错误表示任务还在处理中
    if (error.response?.status === 400) {
      console.log('FAL.ai 任务处理中 (HTTP 400)...')
      console.log('400 响应数据:', JSON.stringify(error.response?.data, null, 2))
      return { completed: false }
    }
    console.error('查询 FAL.ai 结果失败:', error.message)
    if (error.response) {
      console.error('HTTP 状态:', error.response.status)
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2))
    }
    throw error
  }
}

// 轮询 FAL.ai 官方异步任务结果
async function pollFalAiTaskResult(taskId, requestId, responseUrl, userId, sofaImageUrl, fabricImageUrl, maxAttempts = 120) {
  console.log(`========== 开始轮询 FAL.ai 任务结果 ==========`)
  console.log(`Task ID: ${taskId}`)
  console.log(`Request ID: ${requestId}`)
  console.log(`最大轮询次数: ${maxAttempts}`)

  // 使用 API 返回的 response_url 进行轮询
  const statusUrl = responseUrl || `${FAL_BASE_URL}/${FAL_MODEL}/requests/${requestId}`
  console.log(`轮询 URL: ${statusUrl}`)

  let attempts = 0
  const pollInterval = 2000  // 2 秒轮询一次
  const pollStartTime = Date.now()

  const poll = async () => {
    try {
      attempts++
      const attemptStartTime = Date.now()
      console.log(`\n轮询第 ${attempts} 次...`)

      console.log('[异步] 查询 URL:', statusUrl)

      const response = await axios.get(
        statusUrl,
        {
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      )

      const data = response.data
      console.log('[异步] 完整响应:', JSON.stringify(data, null, 2))
      const attemptDuration = Date.now() - attemptStartTime
      console.log(`[异步] 第 ${attempts} 次轮询耗时: ${attemptDuration}ms`)

      // FAL.ai 任务完成时直接返回 images，没有 status 字段
      if (data.images && data.images.length > 0) {
        console.log('[异步] ✓ 任务已完成')
        const totalPollDuration = Date.now() - pollStartTime
        console.log(`[异步] 总轮询耗时: ${totalPollDuration}ms`)

        const imageUrl = data.images[0].url
        console.log('[异步] 生成的图片 URL:', imageUrl)
        // 保存结果
        await saveTaskResult(taskId, imageUrl, userId, sofaImageUrl, fabricImageUrl)
        return
      }

      // 检查状态字段
      console.log('[异步] 任务状态:', data.status)

      if (data.status === 'FAILED') {
        console.error('✗ 任务失败')
        console.error('错误信息:', data.error || data.logs)
        throw new Error(`FAL.ai 任务失败: ${data.error || '未知错误'}`)
      } else if (data.status === 'IN_PROGRESS' || data.status === 'IN_QUEUE') {
        console.log('任务进行中，继续轮询...')

        if (attempts >= maxAttempts) {
          throw new Error(`轮询超时，已尝试 ${maxAttempts} 次`)
        }

        // 等待后继续轮询
        await new Promise(resolve => setTimeout(resolve, pollInterval))
        await poll()
      } else {
        // 其他情况继续轮询
        console.log('继续轮询...')

        if (attempts >= maxAttempts) {
          throw new Error(`轮询超时，已尝试 ${maxAttempts} 次`)
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval))
        await poll()
      }
    } catch (error) {
      console.error(`轮询第 ${attempts} 次失败:`, error.message)

      // 400 错误表示任务还在处理中，继续轮询
      if (error.response?.status === 400) {
        console.log('[异步] 任务处理中 (HTTP 400)...')
        if (attempts >= maxAttempts) {
          throw new Error(`轮询超时，已尝试 ${maxAttempts} 次`)
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval))
        await poll()
        return
      }

      if (attempts >= maxAttempts) {
        throw new Error(`轮询超时，已尝试 ${maxAttempts} 次，最后错误: ${error.message}`)
      }

      // 等待后重试
      console.log(`等待 ${pollInterval}ms 后重试...`)
      await new Promise(resolve => setTimeout(resolve, pollInterval))
      await poll()
    }
  }

  try {
    await poll()
    console.log(`========== FAL.ai 任务轮询完成 ==========`)
  } catch (error) {
    console.error(`========== FAL.ai 任务轮询失败 ==========`)
    console.error('错误:', error.message)

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