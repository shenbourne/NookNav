<template>
  <div class="link-card" @click="showDetail" @mouseenter="showTooltip" @mouseleave="hideTooltip" @mousemove="moveTooltip">
    <div class="card-favicon">
      <img
        v-if="!faviconError"
        :src="displayFavicon"
        :style="iconStyle"
        :alt="link.title"
        @error="faviconError = true"
        class="favicon-img"
      />
      <span v-else class="favicon-fallback" :style="{ background: fallbackColor }">
        {{ fallbackLetter }}
      </span>
    </div>
    <div class="card-content">
      <h3 class="card-title">{{ link.title }}</h3>
      <p class="card-desc" v-if="link.description">{{ link.description }}</p>
      <span class="card-url">{{ displayUrl }}</span>
    </div>
    <div class="card-actions" v-if="showActions" @click.stop>
      <button class="action-btn" @click="$emit('edit')" title="编辑">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="action-btn danger" @click="$emit('delete')" title="删除">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
    <div class="card-buttons" v-if="link.customButtons && link.customButtons.length" @click.stop>
      <a
        v-for="btn in link.customButtons"
        :key="btn.id"
        :href="safeExternalUrl(btn.url) || '#'"
        :class="{ disabled: !safeExternalUrl(btn.url) }"
        :aria-disabled="!safeExternalUrl(btn.url)"
        @click="!safeExternalUrl(btn.url) && $event.preventDefault()"
        target="_blank"
        rel="noopener noreferrer"
        class="custom-btn"
      >
        <!-- Simple Icons SVG -->
        <span v-if="btn.iconSvg" class="btn-icon-svg" v-html="sanitizeSvg(btn.iconSvg)"></span>
        <!-- 兼容旧数据的图片图标 -->
        <img v-else-if="btn.icon" :src="btn.icon" class="btn-icon" alt="" @error="$event.target.style.display = 'none'" />
        <span v-if="btn.label" class="btn-text">{{ btn.label }}</span>
      </a>
    </div>
    <Teleport to="body">
      <div
        v-if="tooltipVisible"
        class="card-tooltip"
        :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
      >
        <div class="tooltip-title">{{ link.title }}</div>
        <div class="tooltip-desc" v-if="link.description">{{ link.description }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useFavicon } from '../composables/useFavicon.js'
import { sanitizeSvg, safeExternalUrl } from '../composables/useSanitize.js'

const props = defineProps({
  link: { type: Object, required: true },
  showActions: { type: Boolean, default: false },
})

const emit = defineEmits(['edit', 'delete', 'showDetail'])

const { displayFavicon, iconStyle, faviconError, fallbackLetter, fallbackColor } = useFavicon(() => props.link)

const tooltipVisible = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)
let tooltipTimer = null

function showTooltip() {
  tooltipTimer = setTimeout(() => {
    tooltipVisible.value = true
  }, 300)
}

function hideTooltip() {
  clearTimeout(tooltipTimer)
  tooltipVisible.value = false
}

function moveTooltip(e) {
  tooltipX.value = e.clientX + 12
  tooltipY.value = e.clientY + 12
}

onBeforeUnmount(() => {
  clearTimeout(tooltipTimer)
})

function showDetail() {
  emit('showDetail', props.link)
}

const displayUrl = computed(() => {
  try {
    const u = new URL(props.link.url)
    return u.hostname
  } catch {
    return props.link.url
  }
})
</script>

<style scoped>
.link-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 20px;
  background: var(--bg-card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: var(--transition-base);
  position: relative;
}

.link-card:hover {
  box-shadow: var(--shadow-hover);
}

.card-favicon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-section);
}

.favicon-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.favicon-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 6px;
}

.card-url {
  font-size: 12px;
  color: var(--color-text-hint);
}

.card-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--transition-base);
}

.link-card:hover .card-actions {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-hint);
  transition: var(--transition-base);
}

.action-btn:hover {
  background: var(--color-btn-secondary);
  color: var(--color-primary);
}

.action-btn.danger:hover {
  background: #fef0ef;
  color: var(--color-danger);
}

.card-buttons {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  gap: 6px;
}

.custom-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border-radius: 12px;
  transition: var(--transition-base);
}

.custom-btn:hover {
  background: var(--color-primary-light);
}

.custom-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex-shrink: 0;
}

.btn-icon-svg {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-icon-svg :deep(svg) {
  width: 100%;
  height: 100%;
}

.btn-text {
  white-space: nowrap;
}

.card-tooltip {
  position: fixed;
  z-index: 9999;
  max-width: 320px;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  pointer-events: none;
}

.tooltip-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
  word-break: break-word;
}

.tooltip-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  word-break: break-word;
}
</style>
