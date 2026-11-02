<template>
  <BaseModal :visible="visible" title="链接详情" width="600px" @close="$emit('close')">
    <div class="link-detail-content">
      <!-- 链接介绍 -->
      <div class="link-header">
        <div class="header-icon">
          <img
            v-if="displayFavicon && !faviconError"
            :src="displayFavicon"
            :style="iconStyle"
            :alt="link.title"
            @error="faviconError = true"
          />
          <span v-else class="fallback-icon" :style="{ background: fallbackColor }">
            {{ fallbackLetter }}
          </span>
        </div>
        <div class="header-info">
          <h3 class="header-title">{{ link.title }}</h3>
          <p v-if="link.description" class="header-desc">{{ link.description }}</p>
        </div>
      </div>

      <!-- 链接按钮 -->
      <div class="link-buttons">
        <a
          :href="safeExternalUrl(link.url) || '#'"
          :class="{ disabled: !safeExternalUrl(link.url) }"
          :aria-disabled="!safeExternalUrl(link.url)"
          target="_blank"
          rel="noopener noreferrer"
          class="btn-official"
          @click="!safeExternalUrl(link.url) && $event.preventDefault()"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          官网
        </a>
        <a
          v-for="btn in link.customButtons"
          :key="btn.id"
          :href="safeExternalUrl(btn.url) || '#'"
          :class="{ disabled: !safeExternalUrl(btn.url) }"
          :aria-disabled="!safeExternalUrl(btn.url)"
          target="_blank"
          rel="noopener noreferrer"
          class="btn-custom"
          @click="!safeExternalUrl(btn.url) && $event.preventDefault()"
        >
          <span v-if="btn.iconSvg" class="btn-icon" v-html="sanitizeSvg(btn.iconSvg)"></span>
          <span v-if="btn.label" class="btn-label">{{ btn.label }}</span>
        </a>
      </div>

      <!-- 受支持的平台 -->
      <div v-if="link.platforms?.length" class="platforms-section">
        <div class="platforms-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span>受支持的平台</span>
        </div>
        <div class="platforms-list">
          <span v-for="platform in link.platforms" :key="platform" class="platform-tag">
            <span class="platform-icon" v-html="getPlatformIcon(platform)"></span>
            {{ platform }}
          </span>
        </div>
      </div>

      <!-- 图片集 -->
      <div v-if="link.imageGallery?.length" class="gallery-section">


        <Transition name="gallery-mode-switch" mode="out-in">
          <!-- 轮播模式 -->
          <div
            v-if="galleryMode === 'carousel'"
            class="gallery-container"
            @mouseenter="handleCarouselMouseEnter"
            @mouseleave="handleCarouselMouseLeave"
          >
          <button v-if="link.imageGallery.length > 1" class="gallery-nav prev" @click="prevImage">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <div class="gallery-image-wrapper" @click="openLightbox">
            <Transition :name="galleryTransitionName" mode="out-in">
              <img
                :key="currentImageIndex"
                :src="navStore.accelerateUrl(link.imageGallery[currentImageIndex])"
                :alt="`${link.title} 图片 ${currentImageIndex + 1}`"
                @error="handleImageError"
              />
            </Transition>
          </div>

          <button v-if="link.imageGallery.length > 1" class="gallery-nav next" @click="nextImage">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>

          <!-- 指示器 -->
          <div v-if="link.imageGallery.length > 1" class="gallery-dots">
            <button
              v-for="(_, index) in link.imageGallery"
              :key="index"
              :class="['dot', { active: index === currentImageIndex }]"
              @click="goToImage(index)"
            />
          </div>
        </div>

        <!-- 横向瀑布流模式 - 无限滚动 -->
        <div
          v-else
          class="gallery-masonry-wrapper"
          @mouseenter="pauseMasonryScroll"
          @mouseleave="startMasonryScroll"
        >
          <div
            class="gallery-masonry-track"
            :class="{ 'is-paused': masonryPaused }"
            :style="masonryTrackStyle"
          >
            <!-- 原始图片 -->
            <div
              v-for="(url, index) in masonryGallery"
              :key="`orig-${index}`"
              class="masonry-item"
              @click="openCarouselAt(index)"
            >
              <img
                :src="navStore.accelerateUrl(url)"
                :alt="`${link.title} 图片 ${index + 1}`"
                @error="handleImageError"
                loading="lazy"
              />
            </div>
            <!-- 复制图片以实现无缝循环 -->
            <div
              v-for="(url, index) in masonryGallery"
              :key="`dup-${index}`"
              class="masonry-item"
              @click="openCarouselAt(index)"
            >
              <img
                :src="navStore.accelerateUrl(url)"
                :alt="`${link.title} 图片 ${index + 1}`"
                @error="handleImageError"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </Transition>

      <!-- 大图模式 -->
      <div v-if="lightboxVisible" class="gallery-lightbox" @click.self="closeLightbox">
        <button class="lightbox-close" @click="closeLightbox">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <img
          :src="navStore.accelerateUrl(link.imageGallery[currentImageIndex])"
          :alt="`${link.title} 大图`"
          @error="handleImageError"
        />
      </div>
      </div>

      <!-- 详细介绍 -->
      <div v-if="link.detailDescription" class="detail-section">
        <div class="detail-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          <span>详细介绍</span>
        </div>
        <div class="detail-content" v-html="renderedDetailDescription"></div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import BaseModal from './BaseModal.vue'
import { renderMarkdown } from '../../composables/useMarkdown.js'
import { sanitizeSvg, safeExternalUrl } from '../../composables/useSanitize.js'
import { useFavicon } from '../../composables/useFavicon.js'
import { useNavStore } from '../../stores/navStore.js'

const navStore = useNavStore()

const props = defineProps({
  visible: Boolean,
  link: { type: Object, required: true },
})

const emit = defineEmits(['close'])

const { displayFavicon, iconStyle, faviconError, fallbackLetter, fallbackColor } = useFavicon(() => props.link)

// 平台图标
const platformIcons = {
  Windows: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>',
  macOS: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
  Linux: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.311.008-.466.022-.39.035-.78.1-1.163.18-.76.164-1.5.398-2.213.71-.717.313-1.4.702-2.042 1.16-.64.458-1.24.98-1.784 1.56-.544.578-1.035 1.21-1.458 1.882-.424.672-.778 1.39-1.054 2.14-.276.752-.473 1.538-.585 2.34-.056.4-.087.804-.092 1.21 0 .136.002.272.01.407.015.27.046.538.093.803.093.53.246 1.048.454 1.544.208.496.47.97.78 1.414.155.222.322.435.5.637.177.202.365.394.563.574l.188.172c.064.058.13.114.197.168l.205.16c.07.053.143.104.217.153l.224.145c.076.048.153.095.232.14l.23.127.237.115c.08.037.161.072.243.105l.248.094c.084.03.169.057.255.082l.26.072c.087.022.175.042.264.06l.267.047.27.035.273.023c.092.006.184.01.276.012l.28.002c.094 0 .187-.003.28-.008.093-.005.186-.013.278-.023.186-.02.37-.05.553-.087.183-.037.364-.082.542-.134.178-.052.353-.11.525-.176.172-.065.34-.138.505-.216.165-.078.326-.163.483-.253l.234-.142c.076-.048.15-.098.223-.15l.216-.158c.07-.053.138-.108.205-.165l.197-.173c.064-.058.126-.117.186-.178l.177-.184c.057-.062.112-.125.165-.19l.154-.196c.05-.066.098-.134.144-.203l.133-.21c.042-.071.083-.143.122-.216l.11-.221c.034-.075.067-.15.098-.227l.087-.232c.027-.078.052-.157.076-.237l.064-.241c.02-.082.038-.164.055-.247l.043-.252c.013-.084.024-.168.034-.253l.022-.255c.006-.086.01-.172.012-.258l.003-.26c0-.174-.006-.347-.016-.52l-.028-.517c-.01-.086-.022-.171-.035-.256l-.044-.254-.054-.25c-.02-.083-.041-.165-.064-.246l-.075-.24c-.027-.079-.055-.157-.085-.234l-.096-.228-.106-.221c-.037-.073-.076-.145-.116-.215l-.127-.208c-.044-.068-.09-.135-.136-.2l-.148-.19c-.052-.062-.104-.122-.158-.18l-.169-.17c-.058-.055-.117-.108-.177-.16l-.186-.148c-.063-.048-.128-.095-.193-.14l-.2-.13c-.068-.042-.137-.083-.207-.122l-.213-.113c-.072-.037-.145-.072-.219-.105l-.224-.096c-.076-.03-.152-.058-.23-.084l-.234-.072c-.079-.023-.158-.045-.238-.064l-.241-.055c-.082-.017-.164-.032-.247-.045l-.25-.034c-.084-.011-.168-.02-.253-.026L12.504 0z"/></svg>',
  iOS: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.22 7.13-.57 1.5-1.31 2.99-2.27 4.08zm-5.85-15.1c.07-1.76 1.55-3.28 3.32-3.43.29 1.96-1.66 3.78-3.32 3.43z"/></svg>',
  Android: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.341c-.5 0-.909.404-.909.904v5.451c0 .5.409.904.909.904.5 0 .909-.404.909-.904v-5.451c0-.5-.409-.904-.909-.904zm-11.046 0c-.5 0-.909.404-.909.904v5.451c0 .5.409.904.909.904.5 0 .909-.404.909-.904v-5.451c0-.5-.409-.904-.909-.904zm11.4-6.757l1.995-3.455c.111-.192.046-.438-.146-.549-.192-.111-.438-.046-.549.146l-2.017 3.493C15.585 7.526 13.855 7.11 12 7.11c-1.855 0-3.585.416-5.16 1.169L4.823 4.786c-.111-.192-.357-.257-.549-.146-.192.111-.257.357-.146.549l1.995 3.455C2.659 10.192.5 13.289.5 16.891h23c0-3.602-2.159-6.699-5.623-8.307zM6.477 15.341c-.5 0-.909.404-.909.904v5.451c0 .5.409.904.909.904.5 0 .909-.404.909-.904v-5.451c0-.5-.409-.904-.909-.904z"/></svg>',
  Web: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
}

function getPlatformIcon(platform) {
  return sanitizeSvg(platformIcons[platform] || '')
}

// 图片展示模式：轮播 / 横向瀑布流
const galleryMode = ref('carousel')

function setGalleryMode(mode) {
  galleryMode.value = mode
  if (mode === 'carousel') {
    startAutoPlay()
    startCarouselInactivityTimer()
    pauseMasonryScroll()
  } else {
    pauseAutoPlay()
    stopCarouselInactivityTimer()
    startMasonryScroll()
  }
}

function openCarouselAt(index) {
  const total = props.link.imageGallery?.length || 0
  if (!total) return
  currentImageIndex.value = (currentImageIndex.value + index) % total
  setGalleryMode('carousel')
}

// 瀑布流画廊（从当前轮播图片开始）
const masonryGallery = computed(() => {
  const arr = props.link.imageGallery || []
  if (!arr.length) return []
  const idx = currentImageIndex.value % arr.length
  return [...arr.slice(idx), ...arr.slice(0, idx)]
})

// 大图模式
const lightboxVisible = ref(false)

function openLightbox() {
  lightboxVisible.value = true
  resetCarouselInactivityTimer()
}

function closeLightbox() {
  lightboxVisible.value = false
  resetCarouselInactivityTimer()
}

function handleCarouselMouseEnter() {
  pauseAutoPlay()
  stopCarouselInactivityTimer()
}

function handleCarouselMouseLeave() {
  startAutoPlay()
  startCarouselInactivityTimer()
}

// 仅横向画廊为默认模式时，临时查看幻灯片后自动返回画廊。
let carouselInactivityTimer = null

function startCarouselInactivityTimer() {
  stopCarouselInactivityTimer()
  const timeout = navStore.siteSettings.galleryCarouselTimeout ?? 10000
  if (navStore.siteSettings.galleryDefaultMode === 'masonry' && galleryMode.value === 'carousel' && timeout > 0) {
    carouselInactivityTimer = setTimeout(() => {
      setGalleryMode('masonry')
    }, timeout)
  }
}

function stopCarouselInactivityTimer() {
  if (carouselInactivityTimer) {
    clearTimeout(carouselInactivityTimer)
    carouselInactivityTimer = null
  }
}

function resetCarouselInactivityTimer() {
  if (galleryMode.value === 'carousel') {
    startCarouselInactivityTimer()
  }
}

// 瀑布流自动滚动
const masonryPaused = ref(false)

const masonryTrackStyle = computed(() => {
  const enabled = navStore.siteSettings.galleryMasonryAutoScroll !== false
  const speed = navStore.siteSettings.galleryMasonryScrollSpeed || 20
  return {
    animationDuration: enabled ? `${speed}s` : '0s',
  }
})

function startMasonryScroll() {
  masonryPaused.value = false
}

function pauseMasonryScroll() {
  masonryPaused.value = true
}

// 图片轮播
const currentImageIndex = ref(0)
let autoPlayInterval = null

const galleryTransitionName = computed(() => {
  const t = navStore.siteSettings.galleryTransition
  if (t === 'slide') return 'gallery-slide'
  if (t === 'fade') return 'gallery-fade'
  return ''
})

function nextImage() {
  if (!props.link.imageGallery?.length) return
  currentImageIndex.value = (currentImageIndex.value + 1) % props.link.imageGallery.length
  resetCarouselInactivityTimer()
}

function prevImage() {
  if (!props.link.imageGallery?.length) return
  currentImageIndex.value = (currentImageIndex.value - 1 + props.link.imageGallery.length) % props.link.imageGallery.length
  resetCarouselInactivityTimer()
}

function goToImage(index) {
  currentImageIndex.value = index
  resetCarouselInactivityTimer()
}

function startAutoPlay() {
  pauseAutoPlay()
  const enabled = navStore.siteSettings.galleryAutoPlay !== false
  const interval = navStore.siteSettings.galleryAutoPlayInterval || 5000
  if (enabled && props.link.imageGallery?.length > 1) {
    autoPlayInterval = setInterval(nextImage, interval)
  }
}

function pauseAutoPlay() {
  if (autoPlayInterval) {
    clearInterval(autoPlayInterval)
    autoPlayInterval = null
  }
}

function handleImageError(e) {
  e.target.style.display = 'none'
}

// Markdown 渲染已提取到 useMarkdown composable

const renderedDetailDescription = computed(() => {
  return renderMarkdown(props.link.detailDescription)
})

// 监听弹窗显示状态
watch(() => props.visible, (val) => {
  if (val) {
    currentImageIndex.value = 0
    lightboxVisible.value = false
    const defaultMode = navStore.siteSettings.galleryDefaultMode || 'carousel'
    galleryMode.value = defaultMode
    faviconError.value = false
    if (defaultMode === 'carousel') {
      startAutoPlay()
      startCarouselInactivityTimer()
      pauseMasonryScroll()
    } else {
      pauseAutoPlay()
      stopCarouselInactivityTimer()
      startMasonryScroll()
    }
  } else {
    pauseAutoPlay()
    pauseMasonryScroll()
    stopCarouselInactivityTimer()
    lightboxVisible.value = false
  }
})

onMounted(() => {
  if (props.visible) {
    startAutoPlay()
    startCarouselInactivityTimer()
  }
})

onUnmounted(() => {
  pauseAutoPlay()
  stopCarouselInactivityTimer()
})
</script>

<style scoped>
.link-detail-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 链接头部 */
.link-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.header-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-section);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.header-icon img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.fallback-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 28px;
  font-weight: 600;
}

.header-info {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 6px;
  word-break: break-word;
}

.header-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  word-break: break-word;
}

/* 按钮区域 */
.link-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.btn-official {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-danger, #e74c3c);
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: opacity 0.2s;
}

.btn-official:hover {
  opacity: 0.9;
}

.btn-official.disabled,
.btn-custom.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-custom {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: var(--transition-base);
}

.btn-custom:hover {
  background: var(--color-primary);
  color: #fff;
}

.btn-custom .btn-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-custom .btn-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

/* 平台区域 */
.platforms-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.platforms-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.platforms-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  flex: 1;
}

.platform-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--bg-section);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.platform-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 图片集 */
.gallery-section {
  margin-top: 8px;
}

.gallery-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.gallery-mode-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.gallery-mode-tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-section);
  padding: 3px;
  border-radius: 6px;
}

.mode-tab {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  color: var(--color-text-secondary);
  transition: var(--transition-base);
}

.mode-tab.active {
  background: var(--color-primary);
  color: #fff;
}

.gallery-container {
  position: relative;
  background: var(--bg-section);
  border-radius: 12px;
  overflow: hidden;
}

.gallery-image-wrapper {
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 24px;
  position: relative;
  cursor: zoom-in;
}

.gallery-image-wrapper img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  border-radius: 12px;
}

.gallery-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  z-index: 10;
}

.gallery-nav:hover {
  background: rgba(0, 0, 0, 0.7);
}

.gallery-nav.prev {
  left: 12px;
}

.gallery-nav.next {
  right: 12px;
}

.gallery-dots {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  z-index: 10;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: background 0.2s;
}

.dot.active {
  background: #fff;
}

.dot:hover {
  background: rgba(255, 255, 255, 0.8);
}

/* 横向瀑布流 - 无限滚动 */
.gallery-masonry-wrapper {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--bg-section);
  border-radius: 12px;
  aspect-ratio: 16 / 9;
}

.gallery-masonry-track {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 100%;
  width: max-content;
  animation: masonry-scroll-right linear infinite;
}

.gallery-masonry-track.is-paused {
  animation-play-state: paused;
}

@keyframes masonry-scroll-right {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

.masonry-item {
  flex-shrink: 0;
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  cursor: zoom-in;
  background: transparent;
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.masonry-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.masonry-item img {
  display: block;
  height: 100%;
  width: auto;
  object-fit: contain;
}

@media (max-width: 640px) {
  .gallery-masonry-track {
    gap: 8px;
  }
}

/* 图片切换动画 - 淡入淡出 */
.gallery-fade-enter-active,
.gallery-fade-leave-active {
  transition: opacity 0.4s ease;
}

.gallery-fade-enter-from,
.gallery-fade-leave-to {
  opacity: 0;
}

/* 图片切换动画 - 平移滑动 */
.gallery-slide-enter-active,
.gallery-slide-leave-active {
  transition: transform 0.4s ease, opacity 0.4s ease;
}

.gallery-slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.gallery-slide-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

/* 轮播/瀑布流模式切换动画 */
.gallery-mode-switch-enter-active,
.gallery-mode-switch-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.gallery-mode-switch-enter-from,
.gallery-mode-switch-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

/* 大图模式 */
.gallery-lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.gallery-lightbox img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
}

.lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 详细介绍 */
.detail-section {
  margin-top: 8px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.detail-content {
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-text-primary);
}

/* Markdown 样式 */
.detail-content :deep(.md-p) {
  margin-bottom: 12px;
}

.detail-content :deep(.md-h1) {
  font-size: 20px;
  font-weight: 600;
  margin: 20px 0 12px;
  color: var(--color-text-primary);
}

.detail-content :deep(.md-h2) {
  font-size: 18px;
  font-weight: 600;
  margin: 18px 0 10px;
  color: var(--color-text-primary);
}

.detail-content :deep(.md-h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 16px 0 8px;
  color: var(--color-text-primary);
}

.detail-content :deep(.md-strong) {
  font-weight: 600;
  color: var(--color-text-primary);
}

.detail-content :deep(.md-em) {
  font-style: italic;
}

.detail-content :deep(.md-del) {
  text-decoration: line-through;
  color: var(--color-text-hint);
}

.detail-content :deep(.md-code) {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  background: var(--bg-section);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--color-danger);
}

.detail-content :deep(.md-code-block) {
  background: var(--bg-section);
  border-radius: 8px;
  padding: 12px 16px;
  margin: 12px 0;
  overflow-x: auto;
}

.detail-content :deep(.md-code-block code) {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  color: var(--color-text-primary);
  background: transparent;
  padding: 0;
}

.detail-content :deep(.md-link) {
  color: var(--color-primary);
  text-decoration: none;
}

.detail-content :deep(.md-link:hover) {
  text-decoration: underline;
}

.detail-content :deep(.md-img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 12px 0;
}

.detail-content :deep(.md-ul) {
  margin: 12px 0;
  padding-left: 24px;
}

.detail-content :deep(.md-li) {
  margin-bottom: 4px;
}

.detail-content :deep(.md-blockquote) {
  border-left: 4px solid var(--color-primary);
  padding-left: 12px;
  margin: 12px 0;
  color: var(--color-text-secondary);
  font-style: italic;
}

.detail-content :deep(.md-hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 16px 0;
}

/* 表格样式 */
.detail-content :deep(.md-table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 14px;
  border: 1px solid var(--color-border);
}

.detail-content :deep(.md-table thead) {
  background: var(--bg-section);
}

.detail-content :deep(.md-th) {
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-bottom: 2px solid var(--color-border);
}

.detail-content :deep(.md-td) {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.detail-content :deep(.md-table tbody tr:nth-child(even)) {
  background: var(--bg-section);
}

.detail-content :deep(.md-table tbody tr:hover) {
  background: var(--color-primary-light);
}
</style>
