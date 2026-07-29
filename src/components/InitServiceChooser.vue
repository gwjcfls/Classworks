<template>
  <div
    v-if="visible"
    class="init-overlay"
  >
    <div class="init-container">
      <div class="init-header">
        <div class="title">
          欢迎使用 Classworks
        </div>
        <div class="subtitle">
          请选择你的使用方式
        </div>
      </div>

      <!-- 主要选择卡片 -->
      <div class="main-card-row">
        <!-- 初次使用 -->
        <v-card
          class="main-service-card gradient-new clickable"
          elevation="4"
          @click="openCloudDialog('create')"
        >
          <v-card-item>
            <div class="card-horizontal-layout">
              <div class="card-icon-wrapper">
                <v-icon
                  color="primary"
                  size="48"
                >
                  mdi-new-box
                </v-icon>
              </div>
              <div class="card-content">
                <div class="text-h6 font-weight-bold">
                  初次使用
                </div>
                <div class="text-body-2 text-medium-emphasis mt-1">
                  创建由 Cloudflare KV 保存的云端作业板
                </div>
              </div>
            </div>
          </v-card-item>
        </v-card>

        <!-- 已注册设备 -->
        <v-card
          class="main-service-card gradient-registered clickable"
          elevation="4"
          @click="openCloudDialog('join')"
        >
          <v-card-item>
            <div class="card-horizontal-layout">
              <div class="card-icon-wrapper">
                <v-icon
                  color="success"
                  size="48"
                >
                  mdi-account-check
                </v-icon>
              </div>
              <div class="card-content">
                <div class="text-h6 font-weight-bold">
                  已注册
                </div>
                <div class="text-body-2 text-medium-emphasis mt-1">
                  使用云端 Token 连接已有作业板
                </div>
              </div>
            </div>
          </v-card-item>
        </v-card>

        <!-- Classworks KV 控制台 -->
        <v-card
          class="main-service-card clickable"
          elevation="4"
          @click="openClassworksKV"
        >
          <v-card-item>
            <div class="card-horizontal-layout">
              <div class="card-icon-wrapper">
                <v-icon
                  color="info"
                  size="48"
                >
                  mdi-database-cog
                </v-icon>
              </div>
              <div class="card-content">
                <div class="text-h6 font-weight-bold">
                  Cloudflare KV
                </div>
                <div class="text-body-2 text-medium-emphasis mt-1">
                  打开 Cloudflare 控制台管理数据
                </div>
              </div>
            </div>
          </v-card-item>
        </v-card>
      </div>

      <div class="options-buttons">
        <v-btn
          prepend-icon="mdi-laptop"
          size="small"
          variant="tonal"
          @click="useLocalMode"
        >
          使用本地模式
        </v-btn>
        <v-btn
          prepend-icon="mdi-key"
          size="small"
          variant="tonal"
          @click="showTokenDialog = true"
        >
          输入 Token
        </v-btn>
      </div>


      <div class="footer-hint">
        云端 Token 只保存在你的设备中，请妥善保管并仅分享给本班设备。
      </div>
    </div>

    <!-- 对话框 -->
    <v-dialog
      v-model="showCloudDialog"
      max-width="600"
      persistent
    >
      <CloudSpaceDialog
        :auto-connect="preconfig.autoExecute"
        :initial-token="preconfig.token || ''"
        :mode="cloudDialogMode"
        @cancel="handleCloudCancel"
        @success="handleCloudSuccess"
      />
    </v-dialog>

    <v-dialog
      v-model="showTokenDialog"
      max-width="500"
    >
      <TokenInputDialog
        :show-cancel="true"
        @cancel="showTokenDialog = false"
        @success="handleTokenSuccess"
      />
    </v-dialog>
  </div>
</template>

<script setup>
import {ref, computed, onMounted, watch} from 'vue'
import {getSetting, setSetting} from '@/utils/settings'
import TokenInputDialog from './auth/TokenInputDialog.vue'
import CloudSpaceDialog from './auth/CloudSpaceDialog.vue'

const props = defineProps({
  preconfig: {
    type: Object,
    default: () => ({
      token: null,
      autoOpen: false,
      autoExecute: false
    })
  }
})

const emit = defineEmits(['done'])

// 控制显示：仅首页且无 kvToken（且 provider 不是 kv-local）显示
const visible = ref(false)

// 对话框控制
const showCloudDialog = ref(false)
const cloudDialogMode = ref('create')
const showTokenDialog = ref(false)
const handledPreconfigToken = ref('')

const provider = computed(() => getSetting('server.provider'))
const isKvProvider = computed(() => provider.value === 'kv-server' || provider.value === 'classworkscloud')
const kvToken = computed(() => getSetting('server.kvToken'))

const evaluateVisibility = () => {
  const path = window.location.pathname
  const onHome = path === '/' || path === '/index' || path === '/index.html'
  const need =
    isKvProvider.value &&
    (props.preconfig?.autoOpen || !kvToken.value || kvToken.value === '')
  visible.value = onHome && need
}

// 监听预配数据和可见状态，确保组件挂载后仍会打开连接对话框
watch(
  [() => props.preconfig, visible],
  ([newPreconfig, isVisible]) => {
    const preconfiguredToken = newPreconfig?.token?.trim()
    if (
      newPreconfig?.autoOpen &&
      preconfiguredToken &&
      isVisible &&
      handledPreconfigToken.value !== preconfiguredToken
    ) {
      handledPreconfigToken.value = preconfiguredToken
      console.log('检测到预配数据，打开云端 Token 连接对话框')
      cloudDialogMode.value = 'join'
      showCloudDialog.value = true
    }
  },
  {immediate: true, deep: true}
)

onMounted(() => {
  evaluateVisibility()
})

const openCloudDialog = (mode) => {
  cloudDialogMode.value = mode
  showCloudDialog.value = true
}

const handleCloudCancel = () => {
  showCloudDialog.value = false
  if (props.preconfig?.autoOpen && kvToken.value) {
    visible.value = false
    emit('done')
  }
}

const handleCloudSuccess = (tokenData) => {
  showCloudDialog.value = false
  console.log('云端空间连接成功:', tokenData)
  evaluateVisibility()
  emit('done')
}

const handleTokenSuccess = () => {
  showTokenDialog.value = false
  evaluateVisibility()
  emit('done')
}

const useLocalMode = () => {
  setSetting('server.provider', 'kv-local')
  visible.value = false
  // 轻量刷新以让首页数据源切换
  window.location.reload()
  emit('done')
}

const openClassworksKV = () => {
  window.open('https://dash.cloudflare.com/?to=/:account/workers/kv/namespaces', '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
.init-overlay {
  position: relative;
}

.init-container {
  max-width: 900px;
  margin: 24px auto;
  padding: 8px 16px;
}

.init-header .title {
  font-size: 28px;
  font-weight: 700;
  text-align: left;
  margin-bottom: 8px;
}

.init-header .subtitle {
  font-size: 14px;
  opacity: .75;
  text-align: left;
}

/* 主要卡片 */
.main-card-row {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 32px;
}

.main-service-card {
  min-height: 100px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.main-service-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.main-service-card .v-card-item {
  padding: 20px 24px;
}

.card-horizontal-layout {
  display: flex;
  align-items: center;
  gap: 20px;
}

.card-icon-wrapper {
  flex-shrink: 0;
}

.card-content {
  flex: 1;
  text-align: left;
}

.gradient-new {
  background: linear-gradient(135deg, rgba(33, 150, 243, .12), rgba(103, 80, 164, 0.08) 60%);
  border: 2px solid rgba(33, 150, 243, .2);
}

.gradient-registered {
  background: linear-gradient(135deg, rgba(76, 175, 80, .12), rgba(0, 184, 212, 0.08) 60%);
  border: 2px solid rgba(76, 175, 80, .2);
}

.gradient-kv {
  background: linear-gradient(135deg, rgba(0, 184, 212, .12), rgba(33, 150, 243, 0.08) 60%);
  border: 2px solid rgba(0, 184, 212, .2);
}

/* 其他选项 */
.alternative-options {
  margin-top: 40px;
  padding: 20px;
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 12px;
}

.options-title {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.8;
  margin-bottom: 12px;
  text-align: left;
}

.options-buttons {
  margin-top: 24px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.clickable {
  cursor: pointer;
}

.footer-hint {
  margin-top: 24px;
  font-size: 13px;
  opacity: .7;
  text-align: left;
}

@media (max-width: 768px) {
  .card-horizontal-layout {
    gap: 16px;
  }

  .card-icon-wrapper .v-icon {
    font-size: 40px !important;
  }

  .options-buttons {
    flex-direction: column;
  }

  .options-buttons .v-btn {
    width: 100%;
  }
}
</style>
