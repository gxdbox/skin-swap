# AI 服务适配器使用指南

## 概述

本云函数采用**适配器模式**设计，实现了类似 Java 接口的功能。无论使用哪个 AI 厂商，都通过统一的接口调用，切换厂商时无需修改业务逻辑代码。

## 架构设计

```
┌─────────────────────────────────────┐
│      index.js (业务逻辑层)           │
│   不关心具体使用哪个 AI 厂商          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│    AIAdapterFactory (工厂类)        │
│   根据配置创建对应的适配器实例        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   BaseAIAdapter (抽象基类/接口)      │
│   定义统一的方法签名                 │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┬───────────┐
       ▼               ▼           ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ FalAiAdapter│ │OpenAIAdapter│ │StabilityAI  │
│             │ │             │ │  Adapter    │
└─────────────┘ └─────────────┘ └─────────────┘
```

## 核心文件说明

### 1. `adapters/BaseAIAdapter.js`
抽象基类，定义了所有适配器必须实现的接口：
- `combineImages(sofaImageUrl, fabricImageUrl)` - 执行图像合成
- `getName()` - 获取适配器名称
- `validateConfig()` - 验证配置是否有效

### 2. `adapters/FalAiAdapter.js`
FAL.ai 的具体实现，继承自 `BaseAIAdapter`

### 3. `config/aiConfig.js`
配置文件，包含：
- `AI_PROVIDERS` - 所有支持的 AI 厂商配置
- `CURRENT_PROVIDER` - 当前使用的厂商（**切换厂商只需修改这里**）

### 4. `adapters/AIAdapterFactory.js`
工厂类，根据配置创建对应的适配器实例

## 如何切换 AI 厂商

### 方法一：修改配置文件（推荐）

只需修改 `config/aiConfig.js` 中的 `CURRENT_PROVIDER`：

```javascript
// 从 FAL.ai 切换到 OpenAI
const CURRENT_PROVIDER = 'OPENAI'  // 原来是 'FAL_AI'
```

**就这么简单！业务代码完全不需要改动。**

### 方法二：动态指定

在调用时指定厂商：

```javascript
const aiAdapter = AIAdapterFactory.createAdapter('OPENAI')
```

## 如何添加新的 AI 厂商

### 步骤 1：创建适配器类

在 `adapters/` 目录下创建新的适配器文件，例如 `OpenAIAdapter.js`：

```javascript
const BaseAIAdapter = require('./BaseAIAdapter')
const axios = require('axios')

class OpenAIAdapter extends BaseAIAdapter {
  constructor(config) {
    super(config)
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl
    this.model = config.model
  }

  getName() {
    return 'OpenAI'
  }

  validateConfig() {
    if (!this.apiKey) {
      throw new Error('OpenAI API Key 未配置')
    }
    return true
  }

  async combineImages(sofaImageUrl, fabricImageUrl) {
    this.validateConfig()
    
    // 实现 OpenAI 的具体调用逻辑
    const response = await axios.post(
      `${this.baseUrl}/images/edits`,
      {
        model: this.model,
        image: sofaImageUrl,
        mask: fabricImageUrl,
        // ... 其他参数
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )

    return { imageUrl: response.data.data[0].url }
  }
}

module.exports = OpenAIAdapter
```

### 步骤 2：添加配置

在 `config/aiConfig.js` 中添加新厂商的配置：

```javascript
const AI_PROVIDERS = {
  FAL_AI: { /* ... */ },
  
  OPENAI: {
    name: 'OpenAI',
    apiKey: 'sk-your-openai-api-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'dall-e-3'
  }
}
```

### 步骤 3：注册适配器

在 `adapters/AIAdapterFactory.js` 中注册新适配器：

```javascript
const OpenAIAdapter = require('./OpenAIAdapter')

class AIAdapterFactory {
  static createAdapter(providerName = null) {
    // ...
    switch (provider) {
      case 'FAL_AI':
        return new FalAiAdapter(config)
      
      case 'OPENAI':
        return new OpenAIAdapter(config)  // 添加这里
      
      default:
        throw new Error(`不支持的 AI 厂商: ${provider}`)
    }
  }
}
```

### 步骤 4：切换使用

修改 `config/aiConfig.js`：

```javascript
const CURRENT_PROVIDER = 'OPENAI'
```

完成！业务代码无需任何修改。

## 优势

### ✅ 符合开闭原则
- 对扩展开放：添加新厂商只需新增适配器
- 对修改封闭：业务逻辑代码无需修改

### ✅ 统一接口
- 所有适配器都实现相同的方法签名
- 返回格式统一：`{ imageUrl: string }`

### ✅ 易于测试
- 可以轻松创建 Mock 适配器用于测试
- 不同厂商可以独立测试

### ✅ 配置集中管理
- 所有 API Key 和配置集中在 `aiConfig.js`
- 便于环境变量管理和安全控制

## 示例：支持多个厂商

```javascript
// config/aiConfig.js
const AI_PROVIDERS = {
  FAL_AI: { /* FAL.ai 配置 */ },
  OPENAI: { /* OpenAI 配置 */ },
  STABILITY_AI: { /* Stability AI 配置 */ },
  MIDJOURNEY: { /* Midjourney 配置 */ }
}

// 切换厂商只需改这一行
const CURRENT_PROVIDER = 'STABILITY_AI'
```

## 注意事项

1. **API Key 安全**：生产环境应使用环境变量而非硬编码
2. **返回格式统一**：所有适配器必须返回 `{ imageUrl: string }` 格式
3. **错误处理**：适配器内部应处理好各种错误情况
4. **超时设置**：根据不同厂商的响应时间调整超时参数

## 微信小程序中的应用

这个设计模式在微信小程序云函数中完全适用，JavaScript 虽然没有 `interface` 关键字，但通过：
- **抽象基类** (BaseAIAdapter) 模拟接口
- **继承机制** 实现多态
- **工厂模式** 统一创建实例

实现了与 Java 接口相同的效果，甚至更加灵活。
