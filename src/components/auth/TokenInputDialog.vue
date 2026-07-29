<template>
  <v-card>
    <v-card-title>输入授权 Token</v-card-title>
    <v-card-text>
      <v-text-field
        v-model="token"
        clearable
        density="comfortable"
        hide-details="auto"
        label="云端 Token"
        placeholder="粘贴另一台设备生成的 cw_... Token"
        variant="outlined"
      />
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
      <v-spacer />
      <v-btn
        v-if="showCancel"
        variant="text"
        @click="$emit('cancel')"
      >
        取消
      </v-btn>
      <v-btn
        :disabled="!token || verifying"
        :loading="verifying"
        color="primary"
        @click="saveToken"
      >
        保存 Token
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import {ref} from 'vue'
import {getDefaultServerDomain, setSetting} from '@/utils/settings'
import axios from '@/axios/axios'

defineProps({
  showCancel: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['success', 'cancel'])

const token = ref('')
const verifying = ref(false)
const error = ref('')

const saveToken = async () => {
  if (!token.value || verifying.value) return
  error.value = ''
  verifying.value = true

  try {
    const serverUrl = getDefaultServerDomain()
    if (!serverUrl) throw new Error('未配置服务器域名')

    await axios.get(`${serverUrl}/kv/_info`, {
      headers: {
        Accept: 'application/json',
        'x-app-token': token.value,
      },
    })

    // 验证通过再保存
    setSetting('server.provider', 'kv-server')
    setSetting('server.domain', serverUrl)
    setSetting('server.kvToken', token.value)
    emit('success')

  } catch (err) {
    const status = err?.response?.status
    if (status === 401 || status === 403) {
      error.value = 'Token 无效或无权限,请确认后重试'
    } else if (status === 404) {
      error.value = '命名空间不存在或服务器未就绪'
    } else {
      error.value = err?.response?.data?.message || err?.message || '验证失败,请稍后重试'
    }
  } finally {
    verifying.value = false
  }
}

// 暴露清空表单的方法
defineExpose({
  reset: () => {
    token.value = ''
    error.value = ''
  }
})
</script>
