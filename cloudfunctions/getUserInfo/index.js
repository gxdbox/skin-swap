const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const { action, userInfo } = event

    // 更新用户信息
    if (action === 'update' && userInfo) {
      // 查询用户是否存在
      const userResult = await db.collection('users').where({
        openid
      }).get()

      if (userResult.data.length > 0) {
        // 更新用户信息
        await db.collection('users').doc(userResult.data[0]._id).update({
          data: {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            updatedAt: db.serverDate()
          }
        })

        return {
          success: true,
          message: '用户信息已更新'
        }
      } else {
        // 创建新用户
        await db.collection('users').add({
          data: {
            openid,
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            fusionCount: 0,
            saveCount: 0,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })

        return {
          success: true,
          message: '用户创建成功'
        }
      }
    }

    // 增加保存次数
    if (action === 'incrementSave') {
      const userResult = await db.collection('users').where({
        openid
      }).get()

      if (userResult.data.length > 0) {
        await db.collection('users').doc(userResult.data[0]._id).update({
          data: {
            saveCount: _.inc(1),
            updatedAt: db.serverDate()
          }
        })
      }

      return {
        success: true
      }
    }

    // 获取用户信息
    const userResult = await db.collection('users').where({
      openid
    }).get()

    if (userResult.data.length > 0) {
      const userData = userResult.data[0]
      return {
        success: true,
        data: {
          openid: userData.openid,
          nickName: userData.nickName,
          avatarUrl: userData.avatarUrl,
          fusionCount: userData.fusionCount || 0,
          saveCount: userData.saveCount || 0,
          createdAt: userData.createdAt
        }
      }
    } else {
      // 用户不存在，返回默认值
      return {
        success: true,
        data: {
          openid,
          nickName: '',
          avatarUrl: '',
          fusionCount: 0,
          saveCount: 0
        }
      }
    }

  } catch (error) {
    console.error('getUserInfo error:', error)
    return {
      success: false,
      error: error.message || '获取用户信息失败'
    }
  }
}