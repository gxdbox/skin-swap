const cloud = require('wx-server-sdk')
const AIAdapterFactory = require('./adapters/AIAdapterFactory')
const jimp = require('jimp')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 图片配置 - 优化加载速度
const IMAGE_CONFIG = {
  maxWidth: 1024, // 上传到 AI 的最大宽度
  maxHeight: 1024, // 上传到 AI 的最大高度
  outputQuality: 70, // 输出图片质量 (%)
  outputMaxWidth: 640 // 输出图片最大宽度（适配手机屏幕）
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID

  console.log('========== 云函数 combinePictures 被调用 ==========')
  console.log('收到事件:', JSON.stringify(event, null, 2))
  console.log('用户ID:', userId)

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
  console.log('========== 开始异步处理任务 ==========')
  console.log('任务ID:', taskId)
  console.log('沙发图片:', sofaImageUrl)
  console.log('布料图片:', fabricImageUrl)

  try {
    console.log('步骤1: 获取云存储文件临时下载链接...')

    // 获取云存储文件的临时下载链接
    const [sofaTempUrl, fabricTempUrl] = await Promise.all([
      getFileDownloadUrl(sofaImageUrl),
      getFileDownloadUrl(fabricImageUrl)
    ])

    console.log('已获取临时URL')
    console.log('沙发临时URL:', sofaTempUrl)
    console.log('布料临时URL:', fabricTempUrl)

    // 使用 AI 适配器进行图像合成
    const aiAdapter = AIAdapterFactory.createAdapter()
    console.log('使用 AI 厂商:', aiAdapter.getName())
    
    const result = await aiAdapter.combineImages(sofaTempUrl, fabricTempUrl)

    console.log('AI 服务返回结果:', result)

    // 压缩并上传结果图片到云存储
    console.log('步骤 2: 压缩并上传结果图片...')
    const compressedResultUrl = await compressAndUploadImage(result.imageUrl, taskId, userId)

    console.log('压缩后的图片 URL:', compressedResultUrl)

    // 更新任务状态为完成
    await db.collection('ai_tasks').doc(taskId).update({
      data: {
        status: 'completed',
        resultImageUrl: compressedResultUrl,
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
        resultImage: compressedResultUrl,
        taskId,
        createdAt: db.serverDate()
      }
    })

    // 更新用户合成次数
    await updateUserFusionCount(userId)

    console.log(`任务 ${taskId} 完成，图片已压缩存储`)

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
    // 如果是 HTTP URL，直接返回
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
    throw new Error(`获取文件链接失败：${error.message}`)
  }
}

// 压缩并上传图片到云存储
async function compressAndUploadImage(imageUrl, taskId, userId) {
  try {
    console.log('下载 AI 生成的图片...')
    
    // 下载图片
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    const imageBuffer = Buffer.from(response.data)
    
    console.log('图片下载完成，原始大小:', (imageBuffer.length / 1024 / 1024).toFixed(2), 'MB')

    // 使用 Jimp 压缩图片
    const image = await jimp.read(imageBuffer)
    
    // 调整尺寸（如果超过最大宽度）
    if (image.getWidth() > IMAGE_CONFIG.outputMaxWidth) {
      image.resize(IMAGE_CONFIG.outputMaxWidth, jimp.AUTO)
    }
    
    console.log('调整后尺寸:', image.getWidth(), 'x', image.getHeight())

    // 压缩并转换为 buffer
    const compressedBuffer = await image.quality(IMAGE_CONFIG.outputQuality).getBufferAsync(jimp.MIME_JPEG)
    
    console.log('压缩后大小:', (compressedBuffer.length / 1024 / 1024).toFixed(2), 'MB')

    // 生成云存储路径
    const cloudPath = `results/${userId}/${taskId}.jpg`

    // 上传到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: compressedBuffer
    })

    console.log('上传到云存储成功，fileID:', uploadResult.fileID)

    // 直接返回 fileID，小程序 image 组件支持 cloud:// 协议
    return uploadResult.fileID

  } catch (error) {
    console.error('压缩并上传图片失败:', error)
    // 如果压缩失败，返回原始 URL
    return imageUrl
  }
}
