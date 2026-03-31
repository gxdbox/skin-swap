# 问题排查记录

本文档记录开发过程中遇到的问题及解决方案，便于后续排查类似问题。

---

## 2026-03-31: 小程序真机下载图片失败

### 问题描述
- **现象**：在手机上通过预览二维码进入小程序，历史记录中的合成图片保存到相册失败
- **对比**：远程 Debug 模式下可以正常保存图片
- **环境**：微信小程序，使用 FAL.ai API 生成图片

### 分析过程

1. **初步猜测**：域名白名单问题
   - 远程 Debug 通过开发者工具代理请求，绕过白名单检查
   - 预览模式手机直接请求，受白名单限制

2. **查看图片 URL 来源**
   - 云函数日志显示：`resultImageUrl: https://v3b.fal.media/files/...`
   - 这是 FAL.ai 的 CDN 地址，不是云存储地址

3. **检查域名白名单配置**
   - 已在 `downloadFile 合法域名` 添加 `https://v3b.fal.media`
   - 但仍然失败

4. **深入分析代码**
   - 下载代码使用 `wx.getImageInfo` 获取图片：
   ```javascript
   const res = await wx.getImageInfo({
     src: filePath
   });
   ```
   - **关键发现**：`wx.getImageInfo` 走的是 **request 合法域名**，不是 downloadFile！

### 解决方案

将 `https://v3b.fal.media` 同时添加到两个白名单：
- **downloadFile 合法域名**（用于 wx.downloadFile）
- **request 合法域名**（用于 wx.request、wx.getImageInfo 等）

### 配置步骤
1. 登录微信公众平台
2. 进入「开发管理」→「开发设置」→「服务器域名」
3. 在 `downloadFile 合法域名` 添加 `https://v3b.fal.media`
4. 在 `request 合法域名` 添加 `https://v3b.fal.media`
5. 保存配置，重新编译小程序测试

### 关键知识点

| API | 对应白名单 |
|-----|-----------|
| `wx.downloadFile` | downloadFile 合法域名 |
| `wx.request` | request 合法域名 |
| `wx.getImageInfo` | request 合法域名 |
| `wx.uploadFile` | uploadFile 合法域名 |

### 待解决问题
- 图片仍然未上传到云存储（压缩上传步骤失败）
- 需要进一步排查 `compressAndUploadImage` 函数为何不执行

---

## 文档格式说明

每条记录包含以下结构：
- **问题描述**：现象、环境、对比情况
- **分析过程**：逐步排查的思路和发现
- **解决方案**：最终如何解决
- **关键知识点**：相关的技术要点