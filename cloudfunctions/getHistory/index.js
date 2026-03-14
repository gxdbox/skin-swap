const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID

  try {
    const { action, page = 1, pageSize = 10, id } = event

    // 清空历史记录
    if (action === 'clear') {
      const result = await db.collection('fusion_history').where({
        userId
      }).remove()

      return {
        success: true,
        message: '历史记录已清空',
        deleted: result.stats.removed
      }
    }

    // 删除单条记录
    if (action === 'delete' && id) {
      const result = await db.collection('fusion_history').doc(id).remove()

      return {
        success: true,
        message: '记录已删除'
      }
    }

    // 获取历史记录列表
    const skip = (page - 1) * pageSize

    // 获取总数
    const countResult = await db.collection('fusion_history').where({
      userId
    }).count()

    // 获取列表
    const listResult = await db.collection('fusion_history').where({
      userId
    })
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

    // 处理图片URL
    const historyList = await Promise.all(listResult.data.map(async (item) => {
      // 获取临时访问URL
      const fileList = []
      if (item.resultImage && item.resultImage.startsWith('cloud://')) {
        fileList.push(item.resultImage)
      }
      if (item.sofaImage && item.sofaImage.startsWith('cloud://')) {
        fileList.push(item.sofaImage)
      }
      if (item.fabricImage && item.fabricImage.startsWith('cloud://')) {
        fileList.push(item.fabricImage)
      }

      if (fileList.length > 0) {
        try {
          const urlResult = await cloud.getTempFileURL({
            fileList
          })

          const urlMap = {}
          urlResult.fileList.forEach(file => {
            urlMap[file.fileID] = file.tempFileURL
          })

          return {
            ...item,
            resultImage: urlMap[item.resultImage] || item.resultImage,
            sofaImage: urlMap[item.sofaImage] || item.sofaImage,
            fabricImage: urlMap[item.fabricImage] || item.fabricImage
          }
        } catch (err) {
          console.error('获取临时URL失败:', err)
          return item
        }
      }

      return item
    }))

    return {
      success: true,
      data: historyList,
      total: countResult.total,
      page,
      pageSize,
      hasMore: skip + historyList.length < countResult.total
    }

  } catch (error) {
    console.error('getHistory error:', error)
    return {
      success: false,
      error: error.message || '获取历史记录失败'
    }
  }
}