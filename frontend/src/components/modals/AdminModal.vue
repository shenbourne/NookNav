<template>
  <BaseModal :visible="visible" title="管理后台" width="480px" @close="$emit('close')">
    <!-- User Info & Logout -->
    <div class="user-bar">
      <div class="user-info">
        <svg class="user-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        <span>{{ username }}</span>
      </div>
      <div class="user-actions">
        <button class="user-action-btn" @click="$emit('changeUsername')" title="修改用户名">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          修改用户名
        </button>
        <button class="user-action-btn" @click="$emit('changePassword')" title="修改密码">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          修改密码
        </button>
        <button class="user-action-btn logout" @click="$emit('logout')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          退出登录
        </button>
      </div>
    </div>

    <!-- Site Settings -->
    <div class="admin-section">
      <h4>站点设置</h4>
      <div class="settings-form">
        <section class="settings-group" aria-label="基础信息">
          <h5 class="settings-group-title">基础信息</h5>
          <div class="form-row">
            <label class="form-label">站点标题</label>
            <input
              class="form-input"
              v-model="settingsForm.title"
              placeholder="请输入站点标题"
            />
          </div>
          <div class="form-row">
            <label class="form-label">站点 Logo</label>
            <div class="logo-mode-tabs">
              <button
                class="logo-mode-btn"
                :class="{ active: logoInputMode === 'url' }"
                @click="logoInputMode = 'url'"
              >图片 URL</button>
              <button
                class="logo-mode-btn"
                :class="{ active: logoInputMode === 'upload' }"
                @click="logoInputMode = 'upload'"
              >上传文件</button>
            </div>
            <input
              v-if="logoInputMode === 'url'"
              class="form-input"
              v-model="settingsForm.logoUrl"
              placeholder="https://example.com/logo.png 或留空使用默认图标"
            />
            <div v-else class="upload-row">
              <input type="file" accept="image/*" @change="onFileChange" ref="fileInput" />
            </div>
          </div>
          <div class="logo-preview" v-if="currentLogoPreview">
            <img :src="currentLogoPreview" alt="Logo 预览" />
            <button class="clear-logo-btn" @click="clearLogo">清除 Logo</button>
          </div>
        </section>
        <section class="settings-group" aria-label="图片集展示">
          <div class="settings-group-header">
            <h5 id="gallery-mode-label" class="settings-group-title">图片集展示</h5>
            <div class="gallery-mode-switch" role="radiogroup" aria-labelledby="gallery-mode-label">
              <label class="gallery-mode-option">
                <input v-model="settingsForm.galleryDefaultMode" type="radio" name="gallery-default-mode" value="carousel" />
                <span>幻灯片</span>
              </label>
              <label class="gallery-mode-option">
                <input v-model="settingsForm.galleryDefaultMode" type="radio" name="gallery-default-mode" value="masonry" />
                <span>横向画廊</span>
              </label>
            </div>
          </div>
          <template v-if="settingsForm.galleryDefaultMode === 'carousel'">
          <h6 class="settings-subtitle">幻灯片设置</h6>
          <div class="form-row">
            <label class="form-label flex-label">
              <span>自动播放</span>
              <input type="checkbox" v-model="settingsForm.galleryAutoPlay" class="toggle-checkbox" />
              <span class="toggle-switch"></span>
            </label>
            <p class="form-hint">开启后，幻灯片模式下的图片将自动切换</p>
          </div>
          <div class="form-row form-row-flex">
            <div class="form-col">
              <label class="form-label">切换间隔（秒）</label>
              <input
                class="form-input"
                type="number"
                min="1"
                max="60"
                v-model.number="settingsForm.galleryAutoPlayInterval"
                placeholder="例如 5"
              />
            </div>
            <div class="form-col">
              <label class="form-label">图片切换方式</label>
              <select v-model="settingsForm.galleryTransition" class="form-input">
                <option value="fade">淡入淡出</option>
                <option value="slide">平移滑动</option>
                <option value="none">无动画</option>
              </select>
            </div>
          </div>
          </template>
          <template v-else>
          <h6 class="settings-subtitle">横向画廊设置</h6>
          <div class="form-row">
            <label class="form-label">无操作后切换为横向画廊（秒）</label>
            <input
              class="form-input"
              type="number"
              min="0"
              max="300"
              v-model.number="settingsForm.galleryCarouselTimeout"
              placeholder="例如 10"
            />
            <p class="form-hint">设置为 0 则关闭自动切换</p>
          </div>
          <div class="form-row">
            <label class="form-label flex-label">
              <span>自动滚动</span>
              <input type="checkbox" v-model="settingsForm.galleryMasonryAutoScroll" class="toggle-checkbox" />
              <span class="toggle-switch"></span>
            </label>
            <p class="form-hint">开启后，横向画廊中的图片将自动匀速滚动</p>
          </div>
          <div class="form-row">
            <label class="form-label">滚动周期（秒）</label>
            <input
              class="form-input"
              type="number"
              min="5"
              max="120"
              v-model.number="settingsForm.galleryMasonryScrollSpeed"
              placeholder="例如 20"
            />
            <p class="form-hint">数值越小滚动速度越快</p>
          </div>
          </template>
        </section>
        <section class="settings-group" aria-label="图片本地存储">
          <h5 class="settings-group-title">图片本地存储</h5>
          <div class="form-row">
            <label class="form-label flex-label">
              <span>图标本地存储</span>
              <input type="checkbox" v-model="settingsForm.localIcons" class="toggle-checkbox" />
              <span class="toggle-switch"></span>
            </label>
          </div>
          <div class="form-row">
            <label class="form-label flex-label">
              <span>图片集本地存储</span>
              <input type="checkbox" v-model="settingsForm.localGallery" class="toggle-checkbox" />
              <span class="toggle-switch"></span>
            </label>
          </div>
          <p class="form-hint">保存后，已有及新增图片将按各自开关自动转为 WebP 并保存在本地。关闭后立即恢复原网址，保留本地副本。</p>
          <p v-if="navStore.imageStorageStatus" class="form-hint" role="status">
            {{ navStore.imageStorageStatus.running ? '转换中' : '转换已结束' }}：
            共 {{ navStore.imageStorageStatus.total }} 项，
            成功 {{ navStore.imageStorageStatus.completed }} 项，
            失败 {{ navStore.imageStorageStatus.failed }} 项
          </p>
          <div v-if="navStore.imageStorageStatus?.errors?.length">
            <details>
              <summary class="form-hint">查看失败详情</summary>
              <ul class="storage-errors">
                <li v-for="(item, index) in navStore.imageStorageStatus.errors" :key="index">
                  {{ item.kind }} · {{ item.source }}：{{ item.error }}
                </li>
              </ul>
            </details>
          </div>
          <p v-if="storageError" class="settings-msg error" role="alert">{{ storageError }}</p>
          <button v-if="navStore.imageStorageStatus?.failed || storageError" type="button"
            class="user-action-btn" :disabled="storageRetrying || navStore.imageStorageStatus?.running"
            @click="retryStorage">
            {{ storageRetrying ? '重试中...' : '重试图片存储' }}
          </button>
        </section>
        <section class="settings-group" aria-label="资源加速">
          <h5 class="settings-group-title">资源加速</h5>
          <div class="form-row">
            <label class="form-label flex-label">
              <span>GitHub 直链加速</span>
              <input type="checkbox" v-model="settingsForm.githubJsdelivr" class="toggle-checkbox" />
              <span class="toggle-switch"></span>
            </label>
            <p class="form-hint">开启后，使用 jsdelivr CDN 加速 raw.githubusercontent.com 的直链</p>
          </div>
        </section>
        <div class="settings-msg error" v-if="settingsError">{{ settingsError }}</div>
        <div class="settings-msg success" v-if="settingsSuccess">{{ settingsSuccess }}</div>
        <button class="save-settings-btn" @click="handleSaveSettings" :disabled="settingsLoading">
          {{ settingsLoading ? '保存中...' : '保存设置' }}
        </button>
      </div>
    </div>

    <div class="admin-section">
      <h4>一级分类管理</h4>
      <draggable
        v-model="navStore.categories"
        item-key="id"
        :animation="200"
        ghost-class="sortable-ghost"
        drag-class="sortable-drag"
        :move="onCategoryMove"
        @end="onCategoryDragEnd"
      >
        <template #item="{ element: cat }">
          <div class="admin-item" :class="{ selected: selectedCatId === cat.id }" @click="selectedCatId = cat.id">
            <svg class="drag-handle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/>
              <circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
            </svg>
            <span class="item-icon">{{ cat.icon }}</span>
            <span class="item-name">{{ cat.name }}</span>
            <div class="item-actions">
              <button class="item-btn" @click.stop="$emit('editCategory', cat)" title="编辑">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="item-btn danger" @click.stop="$emit('deleteCategory', cat)" title="删除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </template>
      </draggable>
      <button class="add-btn" @click="$emit('addCategory')">
        + 添加一级分类
      </button>
    </div>

    <div class="admin-section" v-if="selectedNavCategory">
      <h4>
        二级分类管理
        <span class="section-hint">（{{ selectedNavCategory.icon }} {{ selectedNavCategory.name }}）</span>
      </h4>
      <draggable
        v-if="selectedNavCategory.subCategories?.length"
        v-model="selectedNavCategory.subCategories"
        item-key="id"
        :animation="200"
        ghost-class="sortable-ghost"
        drag-class="sortable-drag"
        @end="onSubCategoryDragEnd(selectedNavCategory.id)"
      >
        <template #item="{ element: sub }">
          <div class="admin-item">
            <svg class="drag-handle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/>
              <circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
            </svg>
            <span class="item-badge" :style="{ background: sub.color }"></span>
            <span class="item-name">{{ sub.name }}</span>
            <div class="item-actions">
              <template v-if="movingSubId === sub.id">
                <select v-model="moveTargetCatId" class="move-select">
                  <option value="" disabled>选择目标分类</option>
                  <option v-for="cat in moveTargetCategories" :key="cat.id" :value="cat.id">
                    {{ cat.icon }} {{ cat.name }}
                  </option>
                </select>
                <button class="item-btn confirm" @click="confirmMove(sub)" title="确认移动">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </button>
                <button class="item-btn" @click="cancelMove" title="取消">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </template>
              <template v-else>
                <button class="item-btn" @click="startMove(sub)" title="移动到其他分类">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
                <button class="item-btn" @click="$emit('editSubCategory', selectedNavCategory.id, sub)" title="编辑">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="item-btn danger" @click="$emit('deleteSubCategory', selectedNavCategory.id, sub)" title="删除">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </template>
            </div>
          </div>
        </template>
      </draggable>
      <div class="empty-sub" v-else>暂无二级分类</div>
      <button class="add-btn" @click="$emit('addSubCategory', selectedNavCategory.id)">
        + 添加二级分类
      </button>
    </div>

  </BaseModal>
</template>

<script setup>
import { ref, watch, computed, onUnmounted } from 'vue'
import draggable from 'vuedraggable'
import BaseModal from './BaseModal.vue'
import { useNavStore } from '../../stores/navStore.js'

const navStore = useNavStore()

const props = defineProps({
  visible: Boolean,
  categories: { type: Array, default: () => [] },
  username: { type: String, default: 'admin' },
})

const emit = defineEmits([
  'close',
  'logout',
  'changePassword',
  'changeUsername',
  'addCategory',
  'editCategory',
  'deleteCategory',
  'addSubCategory',
  'editSubCategory',
  'deleteSubCategory',
  'moveSubCategory',
])

const selectedCatId = ref('')

const selectedNavCategory = computed(() => {
  return navStore.categories.find(c => c.id === selectedCatId.value)
})

// --- Drag reorder ---
function onCategoryMove(evt) {
  // 禁止拖动 "全部" 分类 (cat_001)
  if (evt.draggedContext.element.id === 'cat_001') return false
  // 禁止将其他分类拖到 "全部" 分类前面或作为第一个（如果 all 是第一个的话）
  if (evt.relatedContext.element?.id === 'cat_001' && evt.to === evt.from) {
    // 允许在 cat_001 周围移动，但不允许拖到它上面改变它成为第二个
    // 实际上最简单的做法是只禁止拖拽 cat_001 本身，其他自由拖拽
  }
  return true
}

async function onCategoryDragEnd() {
  const orderedIds = navStore.categories.map(c => c.id)
  try {
    await navStore.reorderCategories(orderedIds)
  } catch (err) {
    console.error('Failed to reorder categories:', err)
  }
}

async function onSubCategoryDragEnd(catId) {
  const cat = navStore.categories.find(c => c.id === catId)
  if (!cat || !cat.subCategories) return
  const orderedIds = cat.subCategories.map(s => s.id)
  try {
    await navStore.reorderSubCategories(catId, orderedIds)
  } catch (err) {
    console.error('Failed to reorder sub-categories:', err)
  }
}

// --- Move sub-category ---
const movingSubId = ref('')
const moveTargetCatId = ref('')

const moveTargetCategories = computed(() => {
  return props.categories.filter(c => c.id !== 'cat_001' && c.id !== selectedCatId.value)
})

function startMove(sub) {
  movingSubId.value = sub.id
  moveTargetCatId.value = ''
}

function cancelMove() {
  movingSubId.value = ''
  moveTargetCatId.value = ''
}

function confirmMove(sub) {
  if (!moveTargetCatId.value) return
  emit('moveSubCategory', sub.id, selectedCatId.value, moveTargetCatId.value)
  movingSubId.value = ''
  moveTargetCatId.value = ''
}

// --- Site settings ---
const settingsForm = ref({
  title: '',
  logoUrl: '',
  githubJsdelivr: false,
  localIcons: true,
  localGallery: false,
  galleryAutoPlay: true,
  galleryAutoPlayInterval: 5,
  galleryTransition: 'fade',
  galleryMasonryAutoScroll: true,
  galleryMasonryScrollSpeed: 20,
  galleryDefaultMode: 'carousel',
  galleryCarouselTimeout: 10,
})
const logoInputMode = ref('url')
const logoFile = ref(null)
const settingsLoading = ref(false)
const settingsError = ref('')
const settingsSuccess = ref('')

const storageError = ref('')
const storageRetrying = ref(false)
let storageTimer = null
let storageGeneration = 0

function stopStoragePolling() {
  storageGeneration++
  clearTimeout(storageTimer)
  storageTimer = null
}

function startStoragePolling() {
  stopStoragePolling()
  const generation = storageGeneration
  async function tick() {
    if (!props.visible || generation !== storageGeneration) return
    try {
      const status = await navStore.fetchImageStorageStatus()
      if (!status) return // Logged out.
      storageError.value = ''
    } catch (err) {
      storageError.value = err.response?.data?.error || '无法获取图片存储状态'
      return // Avoid repeatedly querying an unavailable or unauthorized endpoint.
    }
    if (props.visible && generation === storageGeneration) {
      storageTimer = setTimeout(tick, 2000)
    }
  }
  void tick()
}

async function retryStorage() {
  storageRetrying.value = true
  storageError.value = ''
  try {
    await navStore.retryImageStorage()
    if (props.visible) startStoragePolling()
  } catch (err) {
    storageError.value = err.response?.data?.error || '重试失败，请稍后再试'
  } finally {
    storageRetrying.value = false
  }
}

onUnmounted(stopStoragePolling)

const currentLogoPreview = computed(() => {
  if (logoInputMode.value === 'upload' && logoFile.value) {
    return URL.createObjectURL(logoFile.value)
  }
  return settingsForm.value.logoUrl || ''
})

function onFileChange(e) {
  const file = e.target.files[0]
  logoFile.value = file || null
}

function clearLogo() {
  settingsForm.value.logoUrl = ''
  logoFile.value = null
  logoInputMode.value = 'url'
}

async function handleSaveSettings() {
  settingsLoading.value = true
  settingsError.value = ''
  settingsSuccess.value = ''
  try {
    if (logoInputMode.value === 'upload' && logoFile.value) {
      await navStore.uploadLogo(logoFile.value)
      logoFile.value = null
    } else {
      await navStore.updateSettings({ logoUrl: settingsForm.value.logoUrl })
    }
    await navStore.updateSettings({
      title: settingsForm.value.title,
      githubJsdelivr: settingsForm.value.githubJsdelivr,
      localIcons: settingsForm.value.localIcons,
      localGallery: settingsForm.value.localGallery,
      galleryAutoPlay: settingsForm.value.galleryAutoPlay,
      galleryAutoPlayInterval: (settingsForm.value.galleryAutoPlayInterval || 5) * 1000,
      galleryTransition: settingsForm.value.galleryTransition,
      galleryMasonryAutoScroll: settingsForm.value.galleryMasonryAutoScroll,
      galleryMasonryScrollSpeed: settingsForm.value.galleryMasonryScrollSpeed || 20,
      galleryDefaultMode: settingsForm.value.galleryDefaultMode || 'carousel',
      galleryCarouselTimeout: (settingsForm.value.galleryCarouselTimeout ?? 10) * 1000,
    })
    settingsSuccess.value = '设置已保存'
    setTimeout(() => { settingsSuccess.value = '' }, 2000)
  } catch (err) {
    settingsError.value = err.response?.data?.error || '保存失败，请重试'
  } finally {
    settingsLoading.value = false
  }
}

const categoriesWithSubs = computed(() => {
  return props.categories.filter(c => c.id !== 'cat_001')
})



watch(
  () => props.visible,
  (val) => {
    if (val) {
      if (categoriesWithSubs.value.length) {
        selectedCatId.value = categoriesWithSubs.value[0].id
      }
      // Sync site settings to form
      settingsForm.value = {
        title: navStore.siteSettings.title || '',
        logoUrl: navStore.siteSettings.logoUrl || '',
        githubJsdelivr: navStore.siteSettings.githubJsdelivr || false,
        localIcons: navStore.siteSettings.localIcons !== false,
        localGallery: navStore.siteSettings.localGallery === true,
        galleryAutoPlay: navStore.siteSettings.galleryAutoPlay !== false,
        galleryAutoPlayInterval: (navStore.siteSettings.galleryAutoPlayInterval || 5000) / 1000,
        galleryTransition: navStore.siteSettings.galleryTransition || 'fade',
        galleryMasonryAutoScroll: navStore.siteSettings.galleryMasonryAutoScroll !== false,
        galleryMasonryScrollSpeed: navStore.siteSettings.galleryMasonryScrollSpeed || 20,
        galleryDefaultMode: navStore.siteSettings.galleryDefaultMode || 'carousel',
        galleryCarouselTimeout: (navStore.siteSettings.galleryCarouselTimeout || 10000) / 1000,
      }
      logoFile.value = null
      settingsError.value = ''
      settingsSuccess.value = ''
      storageError.value = ''
      startStoragePolling()
    } else {
      stopStoragePolling()
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.storage-errors {
  padding-left: 18px;
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.gallery-mode-switch {
  display: inline-flex;
  max-width: 100%;
  flex-shrink: 0;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: var(--bg-section);
  box-shadow: inset 0 1px 4px rgb(0 0 0 / 6%);
}

.settings-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.settings-group-header .settings-group-title {
  margin-bottom: 0;
}

.gallery-mode-option {
  position: relative;
  flex: 0 0 auto;
  min-width: 0;
  cursor: pointer;
}

.gallery-mode-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.gallery-mode-option span {
  display: block;
  padding: 4px 12px;
  border-radius: 999px;
  text-align: center;
  white-space: nowrap;
  font-size: 12px;
  line-height: 20px;
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.gallery-mode-option input:checked + span {
  background: var(--color-primary);
  color: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
}

.gallery-mode-option input:focus-visible + span {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.user-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--bg-section);
  border-radius: 8px;
  margin-bottom: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
}

.user-icon {
  color: var(--color-primary);
}

.user-actions {
  display: flex;
  gap: 6px;
}

.user-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
  border-radius: 6px;
  transition: var(--transition-base);
}

.user-action-btn:hover {
  background: var(--color-btn-secondary-hover);
  color: var(--color-primary);
}

.user-action-btn.logout:hover {
  color: var(--color-danger);
}

.admin-section {
  margin-bottom: 24px;
}

.admin-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-hint {
  font-weight: 400;
  font-size: 12px;
  color: var(--color-text-hint);
}

.admin-list {
  background: var(--bg-section);
  border-radius: 8px;
  overflow: hidden;
}

.admin-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.15s;
}

.admin-item:last-child {
  border-bottom: none;
}

.admin-item:hover {
  background: var(--color-btn-secondary-hover);
}

.admin-item.selected {
  background: var(--color-primary-light);
}

.item-icon {
  font-size: 16px;
}

.item-badge {
  width: 4px;
  height: 16px;
  border-radius: 2px;
}

.item-name {
  flex: 1;
  font-size: 14px;
}

.item-actions {
  display: flex;
  gap: 4px;
}

.item-btn {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-hint);
  transition: var(--transition-base);
}

.item-btn:hover {
  background: var(--color-border);
  color: var(--color-primary);
}

.item-btn.danger:hover {
  background: #fef0ef;
  color: var(--color-danger);
}

.item-btn.confirm:hover {
  background: #f0fdf4;
  color: #16a34a;
}

.move-select {
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--color-text-primary);
  outline: none;
  max-width: 120px;
}

.drag-handle {
  color: var(--color-text-hint);
  cursor: grab;
  flex-shrink: 0;
}

.drag-handle:active {
  cursor: grabbing;
}

.sortable-ghost {
  opacity: 0.4;
  background: var(--color-primary-light);
}

.sortable-drag {
  opacity: 0.8;
  background: var(--bg-card);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.empty-sub {
  padding: 20px;
  text-align: center;
  color: var(--color-text-hint);
  font-size: 13px;
  background: var(--bg-section);
  border-radius: 8px;
}

.add-btn {
  width: 100%;
  padding: 10px;
  margin-top: 8px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 500;
  transition: var(--transition-base);
}

.add-btn:hover {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
}

.category-select {
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.category-select label {
  display: block;
  font-size: 12px;
  color: var(--color-text-hint);
  margin-bottom: 8px;
}

.category-select select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: var(--bg-card);
  color: var(--color-text-primary);
}

.category-select select:focus {
  border-color: var(--color-primary);
}

/* Site settings */
.settings-form {
  background: var(--bg-section);
  border-radius: 8px;
  padding: 14px;
}

.settings-group + .settings-group {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.settings-group-title {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.settings-subtitle {
  margin: 16px 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.form-row {
  margin-bottom: 12px;
}

.form-row-flex {
  display: flex;
  gap: 12px;
}

@media (max-width: 400px) {
  .form-row-flex {
    flex-direction: column;
  }
}

.form-col {
  flex: 1;
  min-width: 0;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.flex-label {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: space-between;
  cursor: pointer;
  margin-bottom: 4px;
}

.form-hint {
  font-size: 11px;
  color: var(--color-text-hint);
  margin: 0 0 6px;
}

.toggle-checkbox {
  display: none;
}

.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--color-border);
  border-radius: 10px;
  transition: var(--transition-base);
  flex-shrink: 0;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: var(--transition-base);
}

.toggle-checkbox:checked + .toggle-switch {
  background: var(--color-primary);
}

.toggle-checkbox:checked + .toggle-switch::after {
  left: 18px;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  background: var(--bg-card);
  color: var(--color-text-primary);
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--color-primary);
}

.logo-mode-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.logo-mode-btn {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
  color: var(--color-text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--color-border);
  transition: var(--transition-base);
}

.logo-mode-btn.active {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.upload-row input[type="file"] {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.logo-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 8px;
  background: var(--bg-card);
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

.logo-preview img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 4px;
}

.clear-logo-btn {
  font-size: 12px;
  color: var(--color-danger);
  padding: 4px 8px;
  border-radius: 4px;
  transition: var(--transition-base);
}

.clear-logo-btn:hover {
  background: #fef0ef;
}

.settings-msg {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.settings-msg.error {
  color: var(--color-danger);
  background: #fef0ef;
}

.settings-msg.success {
  color: #16a34a;
  background: #f0fdf4;
}

.save-settings-btn {
  width: 100%;
  padding: 8px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  transition: var(--transition-base);
}

.save-settings-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.save-settings-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
