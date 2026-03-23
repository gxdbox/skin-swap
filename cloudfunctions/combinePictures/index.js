const cloud = require('wx-server-sdk')
const AIAdapterFactory = require('./adapters/AIAdapterFactory')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENIDs

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
