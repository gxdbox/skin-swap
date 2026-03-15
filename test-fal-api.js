// FAL.ai API 测试脚本
const axios = require('axios');

// FAL.ai 配置
const FAL_API_KEY = '3287f5ec-0b40-44e3-832f-cf127e58a93c:562b39a1d04a095b8b9f5acd9aa09ccd';
const FAL_API_URL = 'https://queue.fal.run/fal-ai/playground-v25/inpainting';

// 测试用的公开图片 URL
const TEST_IMAGE_URL = 'https://raw.githubusercontent.com/CompVis/latent-diffusion/main/data/inpainting_examples/overture-creations-5sI6fQgYIuo.png';

async function testFalAiApi() {
  console.log('========== FAL.ai API 测试开始 ==========\n');
  
  try {
    console.log('1. 检查 API Key...');
    if (!FAL_API_KEY || FAL_API_KEY === 'YOUR_FAL_API_KEY') {
      throw new Error('API Key 未配置或无效');
    }
    console.log('✓ API Key 已配置\n');

    console.log('2. 准备请求...');
    const requestBody = {
      image_url: TEST_IMAGE_URL,
      prompt: 'a beautiful landscape with mountains and lake',
      seed: Math.floor(Math.random() * 1000000)
    };
    console.log('请求体:', JSON.stringify(requestBody, null, 2));
    console.log();

    console.log('3. 发送 API 请求...');
    const headers = {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json'
    };
    console.log('请求 URL:', FAL_API_URL);
    console.log('请求头:', { 'Authorization': 'Key ***', 'Content-Type': 'application/json' });
    console.log();

    const startTime = Date.now();
    const response = await axios.post(
      FAL_API_URL,
      requestBody,
      {
        headers: headers,
        timeout: 120000
      }
    );
    const duration = Date.now() - startTime;

    console.log('✓ API 请求成功！\n');
    console.log('4. 响应信息:');
    console.log('HTTP 状态码:', response.status);
    console.log('响应耗时:', duration, 'ms');
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    console.log();

    // 检查响应格式
    console.log('5. 验证响应格式...');
    const data = response.data;
    
    if (data.images && data.images.length > 0) {
      console.log('✓ 生成了图片');
      console.log('图片 URL:', data.images[0].url);
    } else if (data.request_id) {
      console.log('✓ 异步任务已提交');
      console.log('Request ID:', data.request_id);
    } else {
      console.log('⚠ 响应格式不符合预期');
    }
    console.log();

    console.log('========== FAL.ai API 测试成功 ==========');
    console.log('✓ API Key 有效');
    console.log('✓ API 端点可访问');
    console.log('✓ 请求格式正确');
    console.log('✓ 可以开始使用 FAL.ai');

  } catch (error) {
    console.error('========== FAL.ai API 测试失败 ==========\n');
    console.error('错误类型:', error.constructor.name);
    console.error('错误信息:', error.message);
    
    if (error.response) {
      console.error('\nHTTP 错误详情:');
      console.error('状态码:', error.response.status);
      console.error('状态文本:', error.response.statusText);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.code) {
      console.error('错误代码:', error.code);
    }
    
    console.error('\n可能的原因:');
    if (error.response?.status === 401) {
      console.error('- API Key 无效或已过期');
      console.error('- 认证方式不正确');
    } else if (error.response?.status === 400) {
      console.error('- 请求参数格式错误');
      console.error('- 图片 URL 无法访问');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('- 无法连接到 FAL.ai 服务');
      console.error('- 网络连接问题');
    } else if (error.code === 'ENOTFOUND') {
      console.error('- DNS 解析失败');
      console.error('- 网络连接问题');
    }
    
    process.exit(1);
  }
}

// 运行测试
testFalAiApi();
