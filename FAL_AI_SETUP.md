# FAL.ai 集成指南

## 概述
本文档说明如何使用 FAL.ai 的 Playground v2.5 Inpainting 模型来实现沙发布料换肤功能。

## 前置要求

### 1. 获取 FAL.ai API Key
1. 访问 [FAL.ai 官网](https://fal.ai)
2. 注册账户并登录
3. 在 Dashboard 中获取 API Key
4. API Key 格式通常为：`fal_xxxxxxxxxxxxx`

### 2. 配置 API Key
在 `cloudfunctions/combinePictures/index.js` 中，找到以下行：

```javascript
const FAL_API_KEY = 'YOUR_FAL_API_KEY'  // 需要替换为实际的 FAL API Key
```

替换为你的实际 API Key：

```javascript
const FAL_API_KEY = 'fal_your_actual_api_key_here'
```

## API 端点

- **模型**: `fal-ai/playground-v25/inpainting`
- **API URL**: `https://queue.fal.run/fal-ai/playground-v25/inpainting`
- **认证方式**: Bearer Token (API Key)

## 请求参数

```javascript
{
  "image_url": "https://...",      // 原始图片 URL（沙发图片）
  "prompt": "...",                  // 编辑提示词
  "seed": 12345                     // 随机种子（可选）
}
```

## 响应格式

成功响应：
```javascript
{
  "images": [
    {
      "url": "https://..."  // 生成的图片 URL
    }
  ],
  "request_id": "req_xxx"
}
```

## 实现细节

### 调用函数
- **函数名**: `callFalAiImageEdit(sofaImageUrl, fabricImageUrl)`
- **输入**: 沙发图片 URL 和布料图片 URL
- **输出**: `{ imageUrl, isAsync }` 对象

### 超时设置
- 设置为 120 秒（FAL.ai 处理可能需要较长时间）

### 错误处理
- 详细的日志记录
- API Key 验证
- HTTP 错误状态码处理

## 部署步骤

1. **更新 API Key**
   ```bash
   # 编辑 cloudfunctions/combinePictures/index.js
   # 将 FAL_API_KEY 替换为实际的 API Key
   ```

2. **部署云函数**
   - 在微信开发者工具中
   - 右键点击 `cloudfunctions/combinePictures`
   - 选择 "上传并部署：云端安装依赖（不上传node_modules）"

3. **测试**
   - 在小程序中上传沙发图片和布料图片
   - 点击 "开始合成"
   - 查看云函数日志确认 API 调用成功

## 性能指标

- **平均处理时间**: 10-30 秒（取决于 FAL.ai 的队列）
- **支持的图片格式**: JPG, PNG, WebP
- **最大图片大小**: 10MB

## 故障排查

### 401 Unauthorized
- 检查 API Key 是否正确
- 确保 API Key 未过期

### 400 Bad Request
- 检查请求体格式
- 确保图片 URL 可访问

### 超时错误
- FAL.ai 可能处理较慢
- 检查网络连接
- 增加超时时间

## 参考资源

- [FAL.ai 官方文档](https://fal.ai/docs/)
- [Playground v2.5 API 文档](https://fal.ai/models/fal-ai/playground-v25/inpainting/api)
- [FAL.ai 模型列表](https://fal.ai/models)

## 下一步

完成 FAL.ai 集成后，可以：
1. 对比 FAL.ai、Qwen 和 Gemini 的效果
2. 为 FAL.ai 版本创建标签 `v1.0-fal-ai`
3. 测试其他 FAL.ai 模型（如 FLUX.1）
