# 云数据库配置说明

## 概述

本项目使用云数据库存储 AI 服务配置，包括 API Key 等敏感信息。这样做的好处：

- ✅ **安全性**：API Key 不会被提交到代码仓库
- ✅ **灵活性**：可以在云端动态修改配置，无需重新部署云函数
- ✅ **缓存机制**：配置会被缓存 5 分钟，减少数据库查询次数

## 数据库集合配置

### 集合名称：`ai_config`

在微信小程序云开发控制台创建 `ai_config` 集合，并添加以下字段：

### 字段说明

| 字段名 | 类型 | 必填 | 说明 | 示例值 |
|--------|------|------|------|--------|
| `provider` | String | 是 | AI 服务提供商标识 | `FAL_AI` |
| `name` | String | 是 | AI 服务提供商名称 | `FAL.ai` |
| `apiKey` | String | 是 | API 密钥 | `e5bddc6d-f691-4c13-9c35-b792f3edc5d2:75988597b9f8182b8267e01570cbb9cf` |
| `endpoint` | String | 是 | API 端点 | `fal-ai/flux-2/edit` |
| `active` | Boolean | 是 | 是否启用此配置 | `true` |
| `createdAt` | Date | 否 | 创建时间 | 自动生成 |
| `updatedAt` | Date | 否 | 更新时间 | 自动生成 |

## 配置示例

在云开发控制台的 `ai_config` 集合中添加一条记录：

```json
{
  "provider": "FAL_AI",
  "name": "FAL.ai",
  "apiKey": "e5bddc6d-f691-4c13-9c35-b792f3edc5d2:75988597b9f8182b8267e01570cbb9cf",
  "endpoint": "fal-ai/flux-2/edit",
  "active": true,
  "createdAt": "2024-03-23T14:00:00.000Z",
  "updatedAt": "2024-03-23T14:00:00.000Z"
}
```

## 配置步骤

### 1. 创建集合

1. 打开微信开发者工具
2. 进入「云开发」控制台
3. 选择「数据库」
4. 点击「+」创建新集合
5. 集合名称输入：`ai_config`
6. 权限设置：仅管理端可读写（推荐）

### 2. 添加配置记录

1. 进入 `ai_config` 集合
2. 点击「添加记录」
3. 填写上述字段
4. **重要**：确保 `active` 字段设置为 `true`
5. 保存记录

### 3. 验证配置

部署云函数后，可以在云函数日志中查看配置加载情况：

```
从云数据库读取配置...
成功读取配置: { provider: 'FAL_AI', endpoint: 'fal-ai/flux-2/edit', hasApiKey: true }
```

## 配置管理

### 切换 API Key

直接在云开发控制台修改 `ai_config` 集合中的 `apiKey` 字段即可，配置会在 5 分钟内自动生效。

### 切换 AI 服务商

1. 修改 `provider` 字段（如 `OPENAI`、`STABILITY_AI` 等）
2. 修改对应的 `endpoint` 和 `apiKey`
3. 确保在 `AIAdapterFactory.js` 中已实现对应的适配器

### 多配置管理

如果需要支持多个配置：

1. 在 `ai_config` 集合中添加多条记录
2. 只将需要使用的配置的 `active` 设置为 `true`
3. 其他配置的 `active` 设置为 `false`

## 后备配置

如果云数据库读取失败，系统会自动使用 `config/aiConfig.js` 中的本地配置作为后备方案，确保服务可用性。

## 缓存机制

- **缓存时长**：5 分钟
- **缓存位置**：内存中
- **清除缓存**：可调用 `AIAdapterFactory.clearConfigCache()` 手动清除

## 安全建议

1. ⚠️ **不要**将 API Key 提交到代码仓库
2. ✅ 定期更换 API Key
3. ✅ 设置数据库权限为「仅管理端可读写」
4. ✅ 监控 API 使用量，防止滥用
5. ✅ 在 `.gitignore` 中忽略包含敏感信息的配置文件

## 故障排查

### 问题：提示"未找到有效的 AI 配置"

**解决方案**：
1. 检查 `ai_config` 集合是否存在
2. 检查是否有 `active: true` 的记录
3. 检查数据库权限设置

### 问题：配置更新不生效

**解决方案**：
1. 等待 5 分钟缓存过期
2. 或者重新部署云函数
3. 或者调用 `clearConfigCache()` 清除缓存

### 问题：API Key 无效

**解决方案**：
1. 检查 API Key 是否正确复制（注意空格）
2. 检查 API Key 是否已过期
3. 在 FAL.ai 控制台验证 API Key 状态
