/**
 * main.js
 *
 * 精简启动流水线：快速挂载 Vue app，重型依赖（Sentry/Clarity）异步加载
 */

// 核心插件（Vuetify / Router / Pinia）
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'
import GlobalMessage from '@/components/GlobalMessage.vue'

// Composables
import { createApp } from 'vue'

import messageService from './utils/message'

const app = createApp(App)

registerPlugins(app)
app.use(messageService)

app.component('GlobalMessage', GlobalMessage)

// 挂载 Vue app（首要目标：尽快渲染首屏）
app.mount('#app')

// 自托管版本默认不加载第三方分析脚本，班级数据只发送到部署者自己的 Worker。
