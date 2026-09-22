# mychess AI 国际象棋陪练 - 微信小程序

基于网页版（`../国际象棋陪练`）开发的微信小程序前端，**复用同一套后端 API 和数据库**。

## 本地测试步骤

### 1. 前置条件

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（稳定版，本机尚未安装）
- Node.js 后端已在本地运行（默认 `http://localhost:3001`）

### 2. 启动后端（如未运行）

```bash
cd ../国际象棋陪练/backend
npm run dev
# 看到 "Server running on http://localhost:3001" 即成功
```

> 当前机器后端已在 3001 端口运行中，可直接跳过。

### 3. 用微信开发者工具打开本项目

1. 安装并打开微信开发者工具，用微信扫码登录
2. 选择「小程序项目」→「导入」，目录选择本文件夹 `mychess小程序`
3. AppID 选择「测试号」（或填入你的 AppID，`project.config.json` 中默认为占位符）
4. 打开后，在「详情」→「本地设置」中勾选：
   - ✅ **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**
   （本地 `http://localhost` 不是 HTTPS，必须勾选此项才能请求本地后端）

### 4. 构建 npm（重要）

微信开发者工具菜单：「工具」→「构建 npm」。

项目已预置 `miniprogram_npm/chess.js`（手动构建产物），若开发者工具报 npm 相关错误，
执行一次「构建 npm」即可重新生成。

### 5. 预览测试

- 模拟器中直接操作（工具已勾选「不校验合法域名」，模拟器不受域名白名单限制）
- 手机端「预览」扫码后请求会被微信强制校验服务器域名，**必须先在公众平台配置白名单**，
  详见下节；只想临时在真机上验证，可用「真机调试」替代「预览」
- 不要为了真机测试把 `baseUrl` 改成局域网 IP：裸 IP 无法加入白名单，真机上同样请求失败

### 6. 测试账号

本地数据库已创建测试账号（本次测试生成）：

| 用户名 | 密码 | 说明 |
|--------|------|------|
| `mp_test_user` | `test123456` | 普通用户 |
| `admin` | （已被修改） | 管理员，密码请自行重置 |

也可在登录页直接注册新账号。注意以上账号只存在于**本机数据库**；
手机端连的是线上后端，需用线上注册的账号登录。

## 连接腾讯云服务器（部署配置）

客户端已指向生产域名，无需再改动代码：

| 位置 | 值 |
|------|-----|
| `app.js` / `app.ts` → `globalData.baseUrl` | `https://mychess.com.cn` |
| `utils/api.js` / `utils/api.ts` → `baseUrl` | `https://mychess.com.cn` |
| `utils/sse.js` / `utils/sse.ts` → `baseUrl` | `https://mychess.com.cn` |
| `utils/ws.js` / `utils/ws.ts` → `WS_URL` | `wss://mychess.com.cn/ws` |

改域名时以上 8 个文件要同步修改（`.js` 是发布产物，`.ts` 是类型源文件）。

手机端与体验版/正式版必须在微信公众平台
「开发管理」→「开发设置」→「服务器域名」中配置白名单，且域名需满足：

- 必须为**域名**，裸 IP 无法添加（`175.24.131.161` 这类地址加不进去）
- 必须 **HTTPS**（TLS 1.2+，受信任 CA 证书），不能带非 443 端口
- 域名需完成 **ICP 备案**（境内主体）

按项目实际使用到的能力，需要添加三类：

| 白名单 | 域名 | 用于 |
|--------|------|------|
| request 合法域名 | `https://mychess.com.cn` | 所有接口、SSE 分析流 |
| socket 合法域名 | `wss://mychess.com.cn` | 对局/消息 WebSocket（`utils/ws.js`） |
| uploadFile 合法域名 | `https://mychess.com.cn` | 头像上传（`utils/api.js` 的 `uploadAvatar`） |

## 已通过的本地测试

| 测试项 | 结果 |
|--------|------|
| JS 语法检查（25 个文件） | ✅ 全部通过 |
| JSON 格式检查 | ✅ 全部通过 |
| 页面文件完整性（8 页面 × 4 文件） | ✅ |
| 组件引用完整性 | ✅ |
| WXML 事件绑定 ↔ JS 方法交叉检查 | ✅ |
| WXML 不支持语法（函数调用/可选链/Math） | ✅ 已全部清除 |
| SSE 解析器单元测试 | ✅ 6/6 |
| 端到端对弈模拟（走子→AI→分析→保存） | ✅ 13/13 |

运行测试：

```bash
# 端到端模拟（需后端运行中）
TEST_TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"mp_test_user","password":"test123456"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.token))")
TEST_TOKEN="$TEST_TOKEN" node test/e2e-simulation.js

# WXML 事件绑定检查
node test/check-bindings.js
```

## 项目结构

```
├── app.js / app.json / app.wxss    # 入口与全局配置（baseUrl 在 app.js 修改）
├── utils/
│   ├── api.js        # API 封装（30+ 接口，JWT 自动附带）
│   ├── sse.js        # SSE 流式客户端（enableChunked + onChunkReceived）
│   ├── store.js      # 发布-订阅状态管理
│   ├── util.js       # 工具函数
│   └── chessNotation.js  # 走法中文描述
├── components/       # 10 个组件（棋盘/棋子/分析面板/教练聊天等）
├── pages/            # 8 个页面（对弈/登录/棋谱/回放/分析/我的/设置/关于）
├── miniprogram_npm/  # chess.js 构建产物
└── test/             # 本地测试脚本
```

## 与网页版的差异说明

- 拖拽走子 → 点击走子（先点棋子、再点目标格）
- SSE 用 `wx.request` enableChunked 实现（需基础库 ≥ 2.20.1）
- Web Speech 语音播报不可用（小程序无此 API），已省略
- 头像上传改用 `wx.uploadFile`
- 域名必须 HTTPS 且备案后才能在正式环境请求腾讯云后端