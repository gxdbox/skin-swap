const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID

  try {
    const { sofaImage, fabricImage, resultImage, taskId } = event

    if (!sofaImage || !fabricImage || !resultImage) {
      return {
        success: false,
        error: '缺少必要参数'
      }
    }

    // 保存到历史记录
    const result = await db.collection('fusion_history').add({
      data: {
        userId,
        sofaImage,
        fabricImage,
        resultImage,
        taskId: taskId || null,
        createdAt: db.serverDate()
      }
    })

    // 更新用户合成次数
    const userResult = await db.collection('users').where({
      openid: userId
    }).get()

    if (userResult.data.length > 0) {
      await db.collection('users').doc(userResult.data[0]._id).update({
        data: {
          fusionCount: db.command.inc(1),
          updatedAt: db.serverDate()
        }
      })
    }

    return {
      success: true,
      id: result._id,
      message: '保存成功'
    }

  } catch (error) {
    console.error('saveResult error:', error)
    return {
      success: false,
      error: error.message || '保存失败'
    }
  }
}