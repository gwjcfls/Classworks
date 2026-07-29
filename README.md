# Classworks Cloudflare 自托管版

这是 [ZeroCatDev/Classworks](https://github.com/ZeroCatDev/Classworks) 的衍生版本。
原项目是一套面向班级大屏的作业板，本分支保留 Vue 3、Vuetify 3 和 PWA
界面，把前端、接口与云端存储放进同一个 Cloudflare Worker，数据保存在部署者自己的 Workers KV 中。

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

## 不用电脑部署，只用浏览器

这套方法可以在手机或平板上完成，不需要安装 Node.js、pnpm 或 Wrangler。
你需要一个 GitHub 账号和一个 Cloudflare 账号。手机浏览器页面太窄时，建议打开“桌面版网站”。

### 1. Fork 项目

1. 打开 [gwjcfls/Classworks](https://github.com/gwjcfls/Classworks)。
2. 点击页面右上角的 **Fork**。
3. 点击 **Create fork**，把项目复制到自己的 GitHub 账号。

后面的 Cloudflare 构建必须连接你自己的 Fork。不要直接连接
`gwjcfls/Classworks`，否则你无法修改 KV 配置。

### 2. 在 Cloudflare 创建 KV

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 打开 **Workers KV**。
3. 点击 **Create instance**。
4. 名称可以填写 `classworks-board-kv`，然后点击 **Create**。
5. 打开刚创建的 KV，复制它的 **Namespace ID**。

Namespace ID 可以公开，它不是密码，但只能在所属 Cloudflare 账号中使用。

### 3. 用 GitHub 网页修改配置

1. 回到自己的 GitHub Fork。
2. 打开根目录中的 `wrangler.jsonc`。
3. 点击铅笔图标进入编辑页面。
4. 修改文件中的两处内容：

```jsonc
{
  "name": "classworks-board-你的名字",
  "kv_namespaces": [
    {
      "binding": "CLASSWORKS_KV",
      "id": "刚才复制的 Namespace ID"
    }
  ]
}
```

`name` 是最终的 Worker 名称，只能使用英文字母、数字和连字符。建议加上自己的
GitHub 用户名，避免与已有 Worker 重名。`binding` 必须保持为
`CLASSWORKS_KV`，不要修改。

编辑完成后，点击 **Commit changes**，把修改提交到 `main` 分支。

### 4. 从 GitHub 导入到 Cloudflare

1. 回到 Cloudflare 控制台，打开 **Workers & Pages**。
2. 点击 **Create application**。
3. 在 **Import a repository** 旁点击 **Get started**。
4. 首次使用时，按提示授权 Cloudflare 访问 GitHub。只授权自己的 Fork 即可。
5. 选择刚才创建的 `Classworks` Fork。

在构建配置页面填写：

| 配置项 | 填写内容 |
| --- | --- |
| Worker name | 与 `wrangler.jsonc` 中的 `name` 完全一致 |
| Production branch | `main` |
| Root directory | `/` 或留空 |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |

其他项目保持默认。Cloudflare Workers Builds 会自动准备 Node.js、安装依赖并创建部署所需的 API Token，
不需要手动填写 Cloudflare API Token。

点击 **Save and Deploy**。第一次构建通常需要几分钟，可以在构建日志中查看进度。

### 5. 打开作业板

构建成功后，Cloudflare 会显示一个 `workers.dev` 地址。打开它，然后：

1. 选择“初次使用”。
2. 填写作业板名称并创建云端空间。
3. 复制并保存生成的 `cw_...` Token。
4. 其他设备选择“已注册”，输入同一个 Token。

以后只要在 GitHub 的 `main` 分支提交修改，Cloudflare 就会自动重新构建和部署。
不要把 `cw_...` Token、Cloudflare API Token 或其他密码写进 GitHub。

如果首次构建提示 KV namespace 不属于当前账号，说明 `wrangler.jsonc`
中仍然是别人的 Namespace ID。回到第 3 步，换成你自己创建的 KV ID。

相关的 Cloudflare 官方文档：

- [Workers Builds Git 集成](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [Workers Builds 构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [通过控制台创建 Workers KV](https://developers.cloudflare.com/kv/get-started/)

## 使用电脑和命令行部署

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
