# Classworks Cloudflare 自托管版

这是 [ZeroCatDev/Classworks](https://github.com/ZeroCatDev/Classworks) 的衍生版本。
原项目是一套面向班级大屏的作业板，本分支保留 Vue 3、Vuetify 3 和 PWA
界面，把前端、接口与云端存储放进同一个 Cloudflare Worker，数据保存在部署者自己的 Workers KV 中。

在线实例：[classworks-board.gwjcfls.workers.dev](https://classworks-board.gwjcfls.workers.dev)

![Classworks](./images/banner.png)

## 与原项目的不同

这不是原项目的官方托管站。它解决的是另一件事：不单独维护 Socket.IO
服务端，也能把作业板部署到自己的 Cloudflare 账号。

| 项目 | 原项目 | 本分支 |
| --- | --- | --- |
| 部署方式 | 前端与服务端按原项目架构部署 | Cloudflare Worker 同时提供 SPA 静态资源和 API |
| 云端存储 | 使用原项目的数据服务接口 | 使用部署者自己的 Workers KV |
| 班级空间 | 依赖服务端账号或 Token 机制 | 浏览器生成 `cw_...` Token，同一 Token 对应同一份班级数据 |
| 跨设备更新 | Socket.IO 实时连接 | 页面在前台时每 60 秒读取一次事件，隐藏页面暂停轮询 |
| 初次使用 | 原项目初始化流程 | 可创建新云端空间，也可输入已有 Token 加入 |
| 配置分享 | 原设置分享能力 | 统一链接可同时携带云端 Token 与选中的应用设置 |
| 本地数据 | IndexedDB 本地模式 | 保留本地模式，并支持把本地数据批量迁移到 Cloudflare KV |
| 主页功能 | 按原界面提供功能 | 随机点名、出勤统计、随机点人按钮、全屏、时间卡片、考试看板和 UAF 导入导出均可选择并分享设置 |
| 数据管理 | 依赖原服务端 | 设置页提供 KV 数据查看、导入和清理入口 |

## 主要功能

- 每日作业卡片、日期切换、字体缩放和大屏布局
- 考试日程、值日、出勤、学生名单和教师名单
- 随机点名、噪音监测、背景与显示设置
- 消息、紧急通知和跨设备更新
- UAF 作业导入与导出
- 本地离线模式与 Cloudflare 云端模式
- PWA 安装和静态资源离线缓存

## 数据是怎么保存的

云端模式使用随机生成的 Token 作为班级空间凭证。持有相同 Token
的设备会读写同一组 KV 数据。Worker 使用 Token 的摘要划分命名空间，
不会把 Token 以明文作为 KV 键保存。

Token 就是这个班级空间的密码。请先备份，再分享给需要访问作业板的设备。
仓库、Issue、截图和聊天记录都不适合存放真实 Token。

跨设备通知采用一分钟轮询。作业、考试、名单等实际内容仍以 KV
中的数据为准；Workers KV 是最终一致性存储，所以不同地区的设备之间可能出现短暂延迟。

## 技术栈

- Vue 3、Vue Router、Pinia
- Vuetify 3
- Vite 5
- Cloudflare Workers
- Cloudflare Workers KV
- Wrangler 4
- Workbox PWA

## 本地开发

需要 Node.js 20+ 和 pnpm。尚未安装 pnpm 时可以运行：

```bash
npm install -g pnpm
```

安装依赖：

```bash
pnpm install
```

只调试前端：

```bash
pnpm run dev
```

前端默认运行在 `http://localhost:3031`。需要同时调试 Worker API 和本地 KV 时：

```bash
pnpm run build
pnpm run dev:worker
```

然后打开 `http://127.0.0.1:8787`。

## 部署到 Cloudflare Workers

### 1. 登录 Cloudflare

```bash
pnpm exec wrangler login
```

### 2. 创建 KV 命名空间

```bash
pnpm exec wrangler kv namespace create CLASSWORKS_KV
```

Wrangler 会输出命名空间 ID。把 `wrangler.jsonc` 中
`kv_namespaces[0].id` 替换为你自己账号下的 ID：

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "CLASSWORKS_KV",
      "id": "你的 KV 命名空间 ID"
    }
  ]
}
```

KV 命名空间 ID 不是访问密钥，但它只能在所属 Cloudflare 账号下使用。
不要把 Cloudflare API Token 或班级空间 Token 写入仓库。

### 3. 部署

```bash
pnpm run deploy
```

部署完成后，Wrangler 会输出 `workers.dev` 地址。打开页面后：

1. 选择“初次使用”。
2. 填写作业板名称并创建云端空间。
3. 复制并保存生成的 `cw_...` Token。
4. 其他设备选择“已注册”，输入同一个 Token。

## 验证

```bash
pnpm test
pnpm run build
pnpm exec wrangler deploy --dry-run
```

Worker 测试覆盖 Token 长度校验、KV 读写与空间隔离、事件同步，以及部署域名注入。

## AI 使用说明

本分支的 Cloudflare 改造、部分界面调整、测试和文档整理使用了
[OpenAI Codex](https://openai.com/codex/) 协助。代码由项目维护者提出需求并确认部署结果。
AI 不是原项目作者，也不替代维护者对安全、数据和上线版本的审核。

## 致谢与开源协议

感谢 [ZeroCatDev/Classworks](https://github.com/ZeroCatDev/Classworks)
原作者 [SunWuyuan](https://github.com/Sunwuyuan) 以及所有参与原项目的贡献者。
没有他们完成的界面、数据层和班级大屏交互，这个自托管分支不会存在。

原项目官网：[cs.houlang.cloud](https://cs.houlang.cloud)

本项目继续遵循 [AGPL-3.0](LICENSE)。衍生部署和修改版本也应按该许可证提供对应源代码。

Copyright (C) 2020-2026 Sunwuyuan and contributors.
