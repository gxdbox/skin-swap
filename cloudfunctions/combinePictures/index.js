const cloud = require('wx-server-sdk')
const AIAdapterFactory = require('./adapters/AIAdapterFactory')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 图片配置
const IMAGE_CONFIG = {
  maxWidth: 1024,
  maxHeight: 1024
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID

  try {
    const { sofaImageUrl, fabricImageUrl, action } = event

    // 查询任务状态
    if (action === 'getStatus') {
      const { taskId } = event
      const task = await db.collection('ai_tasks').doc(taskId).get()

      if (!task.data) {
        return { success: false, error: '任务不存在' }
      }

      return {
        success: true,
        status: task.data.status,
        resultImageUrl: task.data.resultImageUrl,
        error: task.data.error
      }
    }

    // 创建新任务
    if (!sofaImageUrl || !fabricImageUrl) {
      return {
        success: false,
        error: '请提供沙发图片和布料图片的 URL'
      }
    }

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

    // 同步执行 AI 合成（用户等待这部分）
    const result = await processAICombine(taskId, sofaImageUrl, fabricImageUrl, userId)

    // 异步处理后续：压缩、上传、数据库更新（不阻塞用户，用户已看到结果）
    processPostAI(taskId, result.imageUrl, sofaImageUrl, fabricImageUrl, userId)
      .catch(err => console.error('异步后处理失败:', err))

    // 立即返回 AI 合成的结果（用户可以直接看到图片）
    return {
      success: true,
      taskId: taskId,
      status: 'completed',
      resultImageUrl: result.imageUrl,  // 直接返回 AI 生成的 URL
      message: '合成完成'
    }

  } catch (error) {
    console.error('combinePictures error:', error)
    return {
      success: false,
      error: error.message || '图像合成失败'
    }
  }
}

// 同步执行 AI 合成（用户等待这部分，优化后约 10-12 秒）
async function processAICombine(taskId, sofaImageUrl, fabricImageUrl, userId) {
  console.log(`任务 ${taskId}: 开始 AI 合成`)

  // 优化：前端已传入临时 URL，直接使用，跳过获取临时链接步骤
  // 检查是否是 http 开头的 URL，如果是则直接使用
  const sofaTempUrl = sofaImageUrl.startsWith('http') ? sofaImageUrl : await getFileDownloadUrl(sofaImageUrl)
  const fabricTempUrl = fabricImageUrl.startsWith('http') ? fabricImageUrl : await getFileDownloadUrl(fabricImageUrl)

  console.log(`任务 ${taskId}: 沙发图片 URL 类型：${sofaImageUrl.startsWith('http') ? '临时 URL' : 'fileID'}`)
  console.log(`任务 ${taskId}: 布料图片 URL 类型：${fabricImageUrl.startsWith('http') ? '临时 URL' : 'fileID'}`)

  // 调用 AI 合成
  const aiAdapter = AIAdapterFactory.createAdapter()
  const result = await aiAdapter.combineImages(sofaTempUrl, fabricTempUrl)

  console.log(`任务 ${taskId}: AI 合成完成`)

  return result
}

// 异步后处理：压缩、上传、数据库更新（不阻塞用户）
async function processPostAI(taskId, aiResultUrl, sofaImageUrl, fabricImageUrl, userId) {
  const startTime = Date.now()
  console.log(`任务 ${taskId}: 开始后处理...`)

  try {
    // 压缩并上传
    const compressedResultUrl = await compressAndUploadImage(aiResultUrl, taskId, userId)

    // 并行更新数据库
    await Promise.all([
      db.collection('ai_tasks').doc(taskId).update({
        data: {
          status: 'completed',
          resultImageUrl: compressedResultUrl,
          updatedAt: db.serverDate(),
          completedAt: db.serverDate()
        }
      }),
      db.collection('fusion_history').add({
        data: {
          userId,
          sofaImage: sofaImageUrl,
          fabricImage: fabricImageUrl,
          resultImage: compressedResultUrl,
          taskId,
          createdAt: db.serverDate()
        }
      }),
      updateUserFusionCount(userId)
    ])

    console.log(`任务 ${taskId}: 后处理完成，耗时 ${(Date.now() - startTime) / 1000}秒`)
  } catch (error) {
    console.error(`任务 ${taskId}: 后处理失败`, error)
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
}

// 压缩并上传图片到云存储
async function compressAndUploadImage(imageUrl, taskId, userId) {
  const jimp = require('jimp')
  const axios = require('axios')

  try {
    // 下载图片
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 60000
    })

    const imageBuffer = Buffer.from(response.data)

    // 压缩图片
    const image = await jimp.read(imageBuffer)
    if (image.getWidth() > 640) {
      image.resize(640, jimp.AUTO)
    }

    const compressedBuffer = await image.quality(65).getBufferAsync(jimp.MIME_JPEG)

    // 上传到云存储
    const cloudPath = `results/${userId}/${taskId}.jpg`
    const uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: compressedBuffer
    })

    // 获取临时 URL 用于展示
    const tempUrlResult = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    })

    return tempUrlResult.fileList[0].tempFileURL

  } catch (error) {
    console.error('压缩上传图片失败:', error)
    return imageUrl
  }
}
