<template>
  <a v-if="href" class="original-image-link" :href="href" target="_blank" rel="noopener noreferrer" title="打开原图" aria-label="打开原图">↗</a>
  <span v-else class="original-image-link disabled" aria-disabled="true" title="无有效 HTTP(S) 原图网址" aria-label="无有效原图网址">↗</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ source: { type: String, default: '' } })
const href = computed(() => {
  try {
    const url = new URL(props.source)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
})
</script>

<style scoped>
.original-image-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  text-decoration: none;
  font-size: 18px;
}
.original-image-link:focus-visible {
  outline: 2px solid var(--color-primary);
  border-radius: 4px;
}
.disabled {
  color: var(--color-text-hint);
  opacity: 0.5;
  cursor: default;
}
</style>
