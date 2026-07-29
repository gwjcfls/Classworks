<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon
        class="me-2"
        color="primary"
      >
        {{ mode === 'create' ? 'mdi-cloud-plus' : 'mdi-cloud-key' }}
      </v-icon>
      {{ mode === 'create' ? '创建云端作业板' : '连接已有作业板' }}
    </v-card-title>

    <v-card-text>
      <template v-if="mode === 'create'">
        <v-alert
          class="mb-4"
          type="info"
          variant="tonal"
        >
          系统会生成一个只属于本班的云端 Token。持有同一个 Token
          的设备会共享作业、考试、名单、消息和设置数据。
        </v-alert>

        <v-text-field
          v-model="spaceName"
          :disabled="created"
          label="作业板名称"
          placeholder="例如：高三八班"
          prepend-inner-icon="mdi-google-classroom"
          variant="outlined"
        />

        <v-textarea
          v-if="created"
          v-model="token"
          auto-grow
          class="mt-2 token-field"
          label="云端 Token（请妥善保存）"
          readonly
          rows="2"
          variant="outlined"
        />

        <v-alert
          v-if="created"
          class="mt-3"
          type="success"
          variant="tonal"
        >
          云端空间已创建。请先复制并妥善保存 Token，再点击“已保存并进入作业板”。
          其他设备选择“已注册”，输入此 Token 即可同步。
        </v-alert>

        <v-alert
          v-if="copied"
          class="mt-3"
          type="info"
          variant="tonal"
        >
          Token 已复制到剪贴板。
        </v-alert>
      </template>

      <template v-else>
        <p class="text-body-2 text-medium-emphasis mb-4">
          输入另一台设备创建的云端 Token，即可连接到同一个作业板。
        </p>
        <v-textarea
          v-model="token"
          auto-grow
          label="云端 Token"
          placeholder="cw_..."
          prepend-inner-icon="mdi-key-variant"
          rows="2"
          variant="outlined"
        />
      </template>

      <v-alert
        v-if="error"
        class="mt-3"
        type="error"
        variant="tonal"
      >
        {{ error }}
      </v-alert>
    </v-card-text>

    <v-card-actions>
      <v-btn
        v-if="created"
        prepend-icon="mdi-content-copy"
        @click="copyToken"
      >
        复制 Token
      </v-btn>
      <v-spacer />
      <v-btn
        v-if="!created"
        variant="text"
        @click="$emit('cancel')"
      >
        取消
      </v-btn>
      <v-btn
        v-if="!created"
        :disabled="mode === 'join' ? token.trim().length < 16 : !spaceName.trim()"
        :loading="loading"
        color="primary"
        variant="flat"
        @click="mode === 'create' ? createSpace() : joinSpace()"
      >
        {{ mode === 'create' ? '创建空间' : '连接' }}
      </v-btn>
      <v-btn
        v-else
        color="primary"
        variant="flat"
        @click="finishCreate"
      >
        已保存并进入作业板
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref, watch } from 'vue'
import axios from '@/axios/axios'
import { getDefaultServerDomain, setSetting } from '@/utils/settings'

const props = defineProps({
  mode: {
    type: String,
    default: 'create',
    validator: value => ['create', 'join'].includes(value),
  },
  initialToken: {
    type: String,
    default: '',
  },
  autoConnect: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['success', 'cancel'])

const spaceName = ref('高三八班')
const token = ref('')
const loading = ref(false)
const created = ref(false)
const copied = ref(false)
const error = ref('')

watch(
  () => [props.mode, props.initialToken, props.autoConnect],
  ([mode, initialToken, autoConnect]) => {
    token.value = mode === 'join' ? String(initialToken || '').trim() : ''
    created.value = false
    copied.value = false
    error.value = ''

    if (mode === 'join' && autoConnect && token.value.length >= 16) {
      Promise.resolve().then(joinSpace)
    }
  },
  { immediate: true },
)

function generateToken() {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return `cw_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function saveCloudSettings(value) {
  setSetting('server.provider', 'kv-server')
  setSetting('server.domain', getDefaultServerDomain())
  setSetting('server.kvToken', value)
}

async function verifyToken(value) {
  const serverUrl = getDefaultServerDomain()
  await axios.get(`${serverUrl}/kv/_info`, {
    headers: {
      Accept: 'application/json',
      'x-app-token': value,
    },
  })
}

async function createSpace() {
  if (!spaceName.value.trim() || loading.value) return
  loading.value = true
  error.value = ''
  token.value = generateToken()

  try {
    const serverUrl = getDefaultServerDomain()
    await verifyToken(token.value)
    await axios.put(
      `${serverUrl}/kv/_info`,
      {
        name: spaceName.value.trim(),
        note: spaceName.value.trim(),
      },
      {
        headers: {
          'x-app-token': token.value,
        },
      },
    )
    created.value = true
  } catch (caught) {
    token.value = ''
    error.value =
      caught?.response?.data?.message ||
      '无法创建云端空间，请确认 Cloudflare Worker 与 KV 已正确部署。'
  } finally {
    loading.value = false
  }
}

function finishCreate() {
  if (!created.value || !token.value) return
  saveCloudSettings(token.value)
  emit('success', token.value)
}

async function joinSpace() {
  const value = token.value.trim()
  if (value.length < 16 || loading.value) return
  loading.value = true
  error.value = ''

  try {
    await verifyToken(value)
    saveCloudSettings(value)
    emit('success', value)
  } catch (caught) {
    error.value =
      caught?.response?.data?.message ||
      '连接失败，请检查 Token 是否完整以及 Worker 是否可访问。'
  } finally {
    loading.value = false
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(token.value)
    copied.value = true
    error.value = ''
  } catch {
    copied.value = false
    error.value = '无法自动复制，请手动选中并复制 Token。'
  }
}
</script>

<style scoped>
.token-field :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
}
</style>
