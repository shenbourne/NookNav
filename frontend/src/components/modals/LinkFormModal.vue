<template>
  <BaseModal :visible="visible" :title="isEdit ? '编辑链接' : '添加链接'" width="600px" @close="$emit('close')">
    <form @submit.prevent="handleSubmit">
      <!-- URL + Auto Fetch -->
      <div class="form-group">
        <label>网址</label>
        <div class="url-row">
          <input
            v-model="form.url"
            type="url"
            placeholder="https://example.com"
            required
          />
          <button
            type="button"
            class="btn btn-fetch"
            :disabled="fetching || !form.url"
            @click="autoFetch"
          >
            <span v-if="fetching" class="spinner"></span>
            <span v-else>自动获取</span>
          </button>
        </div>
      </div>

      <!-- Category Select -->
      <div class="form-row">
        <div class="form-group half">
          <label>一级分类</label>
          <select v-model="form.categoryId" required @change="onCategoryChange">
            <option value="" disabled>选择分类</option>
            <option v-for="cat in categoriesWithSubs" :key="cat.id" :value="cat.id">
              {{ cat.icon }} {{ cat.name }}
            </option>
          </select>
        </div>
        <div class="form-group half">
          <label>二级分类</label>
          <select v-model="form.subCategoryId" required>
            <option value="" disabled>选择二级分类</option>
            <option v-for="sub in availableSubCategories" :key="sub.id" :value="sub.id">
              {{ sub.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- Title -->
      <div class="form-group">
        <label>标题</label>
        <input v-model="form.title" type="text" placeholder="网站标题" />
      </div>

      <!-- Description (纯文本) -->
      <div class="form-group">
        <label>描述</label>
        <textarea v-model="form.description" rows="2" placeholder="简短描述（纯文本）"></textarea>
      </div>

      <!-- Platforms (复选框) -->
      <div class="form-group">
        <label>支持平台</label>
        <div class="platforms-row">
          <label v-for="platform in platformOptions" :key="platform.value" class="platform-checkbox">
            <input
              type="checkbox"
              :value="platform.value"
              v-model="form.platforms"
            />
            <span class="platform-icon" v-html="sanitizeSvg(platform.icon)"></span>
            <span class="platform-label">{{ platform.label }}</span>
          </label>
        </div>
      </div>

      <!-- Favicon Preview -->
      <div class="form-group">
        <div class="favicon-header">
          <label>图标网址</label>
          <div class="favicon-scale">
            <input v-model.number="form.iconScale" type="range" min="50" max="200" step="5"
              aria-label="图标缩放比例" :aria-valuetext="`${form.iconScale}%`" />
            <output>{{ form.iconScale }}%</output>
          </div>
          <button
            type="button"
            class="btn btn-unified-icon"
            @click="openUnifiedIconPicker"
          >
            搜索图标库
          </button>
        </div>
        
        <div class="favicon-layout" :style="{ '--icon-scale': form.iconScale / 100 }">
          <div class="favicon-preview favicon-preview-light" aria-label="亮色图标预览">
            <img v-if="form.favicon" :key="form.favicon" :src="form.favicon" alt="亮色图标"
              @error="($event.target.style.display = 'none')" />
            <span v-else>亮色<br />图标</span>
          </div>
          <div class="favicon-fields">
            <div class="favicon-row">
              <label for="link-favicon-light" class="favicon-label">亮色</label>
              <div class="favicon-input">
                <input id="link-favicon-light" v-model="form.favicon" type="text" placeholder="亮色主题图标 URL" />
                <OriginalImageLink :source="imageSourceUrl(form.favicon, form.imageOrigins.favicon)" />
              </div>
            </div>
            <div class="favicon-row favicon-row-dark">
              <div class="favicon-input">
                <OriginalImageLink :source="imageSourceUrl(form.faviconDark, form.imageOrigins.faviconDark)" />
                <input id="link-favicon-dark" v-model="form.faviconDark" type="text" placeholder="暗色主题图标 URL（可选）" />
              </div>
              <label for="link-favicon-dark" class="favicon-label">暗色</label>
            </div>
          </div>
          <div class="favicon-preview favicon-preview-dark" aria-label="暗色图标预览">
            <img v-if="form.faviconDark" :key="form.faviconDark" :src="form.faviconDark" alt="暗色图标"
              @error="($event.target.style.display = 'none')" />
            <span v-else>暗色<br />图标</span>
          </div>
        </div>
      </div>

      <!-- Image Gallery (动态输入列表) -->
      <div class="form-group">
        <label>
          图片集
          <button type="button" class="btn-add-row" @click="addImage">+ 添加</button>
        </label>
        <draggable
          v-model="form.imageGallery"
          item-key="id"
          handle=".drag-handle"
          animation="200"
          ghost-class="drag-ghost"
          chosen-class="drag-chosen"
          drag-class="drag-dragging"
        >
          <template #item="{ element, index }">
            <div class="image-row">
              <div class="drag-handle" title="拖动排序">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="9" cy="6" r="1.5" fill="currentColor"/>
                  <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
                  <circle cx="9" cy="18" r="1.5" fill="currentColor"/>
                  <circle cx="15" cy="6" r="1.5" fill="currentColor"/>
                  <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
                  <circle cx="15" cy="18" r="1.5" fill="currentColor"/>
                </svg>
              </div>
              <input
                v-model="element.url"
                type="text"
                aria-label="图片网址或本地相对路径"
                placeholder="https://example.com/image.png 或 /uploads/..."
                class="image-url-input"
              />
              <div class="image-preview" v-if="element.url">
                <img
                  :src="element.url"
                  @error="($event.target.style.display = 'none')"
                  @load="($event.target.style.display = 'block')"
                />
              </div>
              <button type="button" class="btn-remove-row" @click="removeImage(index)" title="移除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <OriginalImageLink :source="imageSourceUrl(element.url, element.origin)" />
            </div>
          </template>
        </draggable>
      </div>

      <!-- Detail Description (Markdown) -->
      <div class="form-group">
        <label>
          详细介绍
          <span class="label-hint">支持 Markdown 格式</span>
        </label>
        <textarea
          v-model="form.detailDescription"
          rows="6"
          placeholder="# 标题\n\n**粗体** *斜体* \`代码\`\n\n- 列表项 1\n- 列表项 2\n\n[链接文字](https://example.com)"
        ></textarea>
      </div>

      <!-- Custom Buttons -->
      <div class="form-group">
        <label>
          自定义按钮
          <button type="button" class="btn-add-row" @click="addButton">+ 添加</button>
        </label>
        <draggable
          v-model="form.customButtons"
          item-key="id"
          handle=".drag-handle"
          animation="200"
          ghost-class="drag-ghost"
          chosen-class="drag-chosen"
          drag-class="drag-dragging"
        >
          <template #item="{ element, index }">
            <div class="button-row">
              <div class="drag-handle" title="拖动排序">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="9" cy="6" r="1.5" fill="currentColor"/>
                  <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
                  <circle cx="9" cy="18" r="1.5" fill="currentColor"/>
                  <circle cx="15" cy="6" r="1.5" fill="currentColor"/>
                  <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
                  <circle cx="15" cy="18" r="1.5" fill="currentColor"/>
                </svg>
              </div>
              <!-- 图标选择 -->
              <div class="btn-icon-select-wrapper">
                <button 
                  type="button" 
                  class="btn-icon-select" 
                  @click="openIconPicker(index)"
                  :title="element.iconSlug || '选择图标'"
                >
                  <span v-if="element.iconSvg" class="icon-display" v-html="sanitizeSvg(element.iconSvg)"></span>
                  <span v-else class="icon-placeholder">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </span>
                </button>
                <button 
                  v-if="element.iconSvg" 
                  type="button" 
                  class="btn-icon-clear"
                  @click="clearIcon(index)"
                  title="清除图标"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <input v-model="element.label" type="text" placeholder="按钮文字" class="btn-label-input" />
              <input v-model="element.url" type="url" placeholder="https://..." class="btn-url-input" />
              <button type="button" class="btn-remove-row" @click="removeButton(index)" title="移除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </template>
        </draggable>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-cancel" @click="$emit('close')">取消</button>
        <button type="submit" class="btn btn-primary">{{ isEdit ? '保存' : '添加' }}</button>
      </div>
    </form>
  </BaseModal>

  <!-- Simple Icons 选择器（用于自定义按钮） -->
  <SimpleIconPicker
    v-if="simpleIconPickerVisible"
    :visible="simpleIconPickerVisible"
    :selected-slug="currentButtonIndex >= 0 ? form.customButtons[currentButtonIndex]?.iconSlug : ''"
    @close="simpleIconPickerVisible = false"
    @select="onSimpleIconSelected"
  />

  <!-- 统一图标选择器 -->
  <UnifiedIconPicker
    v-if="unifiedIconPickerVisible"
    :visible="unifiedIconPickerVisible"
    @close="unifiedIconPickerVisible = false"
    @select="onUnifiedIconSelected"
  />
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import draggable from 'vuedraggable'
import BaseModal from './BaseModal.vue'
import OriginalImageLink from '../OriginalImageLink.vue'
import SimpleIconPicker from './SimpleIconPicker.vue'
import UnifiedIconPicker from './UnifiedIconPicker.vue'
import { useNavStore } from '../../stores/navStore.js'
import { sanitizeSvg } from '../../composables/useSanitize.js'
import { createImageFields, imageSourceUrl } from '../../composables/useImageForm.js'

const props = defineProps({
  visible: Boolean,
  link: { type: Object, default: null },
  categoryId: { type: String, default: '' },
  subCategoryId: { type: String, default: '' },
  categories: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'submit'])

const store = useNavStore()
const fetching = ref(false)
const isEdit = ref(false)
const simpleIconPickerVisible = ref(false)
const unifiedIconPickerVisible = ref(false)
const currentButtonIndex = ref(-1)

// 支持平台选项
const platformOptions = [
  { value: 'Windows', label: 'Windows', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>' },
  { value: 'macOS', label: 'macOS', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>' },
  { value: 'Linux', label: 'Linux', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.311.008-.466.022-.39.035-.78.1-1.163.18-.76.164-1.5.398-2.213.71-.717.313-1.4.702-2.042 1.16-.64.458-1.24.98-1.784 1.56-.544.578-1.035 1.21-1.458 1.882-.424.672-.778 1.39-1.054 2.14-.276.752-.473 1.538-.585 2.34-.056.4-.087.804-.092 1.21 0 .136.002.272.01.407.015.27.046.538.093.803.093.53.246 1.048.454 1.544.208.496.47.97.78 1.414.155.222.322.435.5.637.177.202.365.394.563.574l.188.172c.064.058.13.114.197.168l.205.16c.07.053.143.104.217.153l.224.145c.076.048.153.095.232.14l.23.127.237.115c.08.037.161.072.243.105l.248.094c.084.03.169.057.255.082l.26.072c.087.022.175.042.264.06l.267.047.27.035.273.023c.092.006.184.01.276.012l.28.002c.094 0 .187-.003.28-.008.093-.005.186-.013.278-.023.186-.02.37-.05.553-.087.183-.037.364-.082.542-.134.178-.052.353-.11.525-.176.172-.065.34-.138.505-.216.165-.078.326-.163.483-.253l.234-.142c.076-.048.15-.098.223-.15l.216-.158c.07-.053.138-.108.205-.165l.197-.173c.064-.058.126-.117.186-.178l.177-.184c.057-.062.112-.125.165-.19l.154-.196c.05-.066.098-.134.144-.203l.133-.21c.042-.071.083-.143.122-.216l.11-.221c.034-.075.067-.15.098-.227l.087-.232c.027-.078.052-.157.076-.237l.064-.241c.02-.082.038-.164.055-.247l.043-.252c.013-.084.024-.168.034-.253l.022-.255c.006-.086.01-.172.012-.258l.003-.26c0-.174-.006-.347-.016-.52l-.028-.517c-.01-.086-.022-.171-.035-.256l-.044-.254-.054-.25c-.02-.083-.041-.165-.064-.246l-.075-.24c-.027-.079-.055-.157-.085-.234l-.096-.228-.106-.221c-.037-.073-.076-.145-.116-.215l-.127-.208c-.044-.068-.09-.135-.136-.2l-.148-.19c-.052-.062-.104-.122-.158-.18l-.169-.17c-.058-.055-.117-.108-.177-.16l-.186-.148c-.063-.048-.128-.095-.193-.14l-.2-.13c-.068-.042-.137-.083-.207-.122l-.213-.113c-.072-.037-.145-.072-.219-.105l-.224-.096c-.076-.03-.152-.058-.23-.084l-.234-.072c-.079-.023-.158-.045-.238-.064l-.241-.055c-.082-.017-.164-.032-.247-.045l-.25-.034c-.084-.011-.168-.02-.253-.026L12.504 0z"/></svg>' },
  { value: 'iOS', label: 'iOS', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.22 7.13-.57 1.5-1.31 2.99-2.27 4.08zm-5.85-15.1c.07-1.76 1.55-3.28 3.32-3.43.29 1.96-1.66 3.78-3.32 3.43z"/></svg>' },
  { value: 'Android', label: 'Android', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.341c-.5 0-.909.404-.909.904v5.451c0 .5.409.904.909.904.5 0 .909-.404.909-.904v-5.451c0-.5-.409-.904-.909-.904zm-11.046 0c-.5 0-.909.404-.909.904v5.451c0 .5.409.904.909.904.5 0 .909-.404.909-.904v-5.451c0-.5-.409-.904-.909-.904zm11.4-6.757l1.995-3.455c.111-.192.046-.438-.146-.549-.192-.111-.438-.046-.549.146l-2.017 3.493C15.585 7.526 13.855 7.11 12 7.11c-1.855 0-3.585.416-5.16 1.169L4.823 4.786c-.111-.192-.357-.257-.549-.146-.192.111-.257.357-.146.549l1.995 3.455C2.659 10.192.5 13.289.5 16.891h23c0-3.602-2.159-6.699-5.623-8.307zM6.477 15.341c-.5 0-.909.404-.909.904v5.451c0 .5.409.904.909.904.5 0 .909-.404.909-.904v-5.451c0-.5-.409-.904-.909-.904z"/></svg>' },
  { value: 'Web', label: 'Web', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>' },
]

const form = ref(getDefaultForm())

function getDefaultForm() {
  return {
    url: '',
    title: '',
    description: '',
    platforms: [],
    ...createImageFields(),
    detailDescription: '',
    categoryId: '',
    subCategoryId: '',
    customButtons: [],
  }
}

// Filter categories that have subCategories
const categoriesWithSubs = computed(() => {
  return props.categories.filter(c => c.subCategories && c.subCategories.length > 0)
})

// Get available sub-categories for selected category
const availableSubCategories = computed(() => {
  const cat = props.categories.find(c => c.id === form.value.categoryId)
  return cat?.subCategories || []
})

function onCategoryChange() {
  form.value.subCategoryId = ''
}

watch(
  () => props.visible,
  (val) => {
    if (val && props.link) {
      isEdit.value = true
      form.value = {
        url: props.link.url,
        title: props.link.title,
        description: props.link.description,
        platforms: props.link.platforms || [],
        ...createImageFields(props.link),
        detailDescription: props.link.detailDescription || '',
        categoryId: props.categoryId,
        subCategoryId: props.subCategoryId,
        customButtons: (props.link.customButtons || []).map(b => ({ ...b })),
      }
    } else if (val) {
      isEdit.value = false
      form.value = getDefaultForm()
      if (props.categoryId) {
        form.value.categoryId = props.categoryId
      }
      if (props.subCategoryId) {
        form.value.subCategoryId = props.subCategoryId
      }
    }
  },
  { immediate: true }
)

async function autoFetch() {
  if (!form.value.url) return
  fetching.value = true
  try {
    const meta = await store.fetchMeta(form.value.url, { skipIconSource: true })
    if (meta) {
      if (meta.title) form.value.title = meta.title
      if (meta.description) form.value.description = meta.description
      if (meta.favicon) form.value.favicon = meta.favicon
    }
  } catch {
    // Silently fail
  } finally {
    fetching.value = false
  }
}

function openUnifiedIconPicker() {
  unifiedIconPickerVisible.value = true
}

function onUnifiedIconSelected(iconData) {
  // 统一处理所有图标源的选择
  if (iconData.light) {
    form.value.favicon = iconData.light
  }
  if (iconData.dark) {
    form.value.faviconDark = iconData.dark
  }
  unifiedIconPickerVisible.value = false
}

function openIconPicker(index) {
  currentButtonIndex.value = index
  simpleIconPickerVisible.value = true
}

function onSimpleIconSelected(iconData) {
  if (currentButtonIndex.value >= 0) {
    const button = form.value.customButtons[currentButtonIndex.value]
    button.iconSlug = iconData.slug
    button.iconSvg = iconData.svg
    button.iconBrandColor = iconData.brandColor
  }
  simpleIconPickerVisible.value = false
  currentButtonIndex.value = -1
}

function clearIcon(index) {
  const button = form.value.customButtons[index]
  delete button.iconSlug
  delete button.iconSvg
  delete button.iconBrandColor
}

// 图片集相关方法
function addImage() {
  form.value.imageGallery.push({ id: 'img_' + Date.now(), url: '' })
}

function removeImage(index) {
  form.value.imageGallery.splice(index, 1)
}

function addButton() {
  form.value.customButtons.push({ label: '', url: '' })
}

function removeButton(i) {
  form.value.customButtons.splice(i, 1)
}

function handleSubmit() {
  emit('submit', {
    isEdit: isEdit.value,
    linkId: props.link?.id,
    categoryId: form.value.categoryId,
    subCategoryId: form.value.subCategoryId,
    data: {
      url: form.value.url,
      title: form.value.title,
      description: form.value.description,
      platforms: form.value.platforms,
      iconScale: form.value.iconScale,
      favicon: imageSourceUrl(form.value.favicon, form.value.imageOrigins.favicon),
      faviconDark: imageSourceUrl(form.value.faviconDark, form.value.imageOrigins.faviconDark),
      imageGallery: form.value.imageGallery.map(img => imageSourceUrl(img.url, img.origin)).filter(url => url && url.trim()),
      detailDescription: form.value.detailDescription,
      customButtons: form.value.customButtons
        .filter(b => (b.label || b.iconSvg || b.icon) && b.url)
        .map(b => ({
          id: b.id,
          label: b.label,
          url: b.url,
          iconSlug: b.iconSlug,
          iconSvg: b.iconSvg,
          iconBrandColor: b.iconBrandColor,
          // 兼容旧数据
          icon: b.icon,
        })),
    },
  })
}
</script>

<style scoped>
.form-group {
  margin-bottom: 16px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-group.half {
  flex: 1;
}

.form-group label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.label-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-hint);
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition-base);
  background: var(--bg-card);
  color: var(--color-text-primary);
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  border-color: var(--color-primary);
}

.form-group textarea {
  resize: vertical;
  min-height: 60px;
}

.url-row {
  display: flex;
  gap: 8px;
}

.url-row input {
  flex: 1;
}

.btn-fetch {
  padding: 10px 16px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  min-width: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition-base);
}

.btn-fetch:hover:not(:disabled) {
  background: #3d7bc7;
}

.btn-fetch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-unified-icon {
  padding: 10px 16px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition-base);
}

.btn-unified-icon:hover {
  background: #3d7bc7;
}

.favicon-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.favicon-header label {
  margin-bottom: 0;
}

.favicon-scale {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  max-width: 180px;
}

.form-group .favicon-scale input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.favicon-scale output {
  min-width: 30px;
  font-size: 11px;
  color: var(--color-text-hint);
  white-space: nowrap;
}

.favicon-layout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.favicon-fields {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}

.favicon-row,
.favicon-input {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.favicon-input {
  flex: 1;
}

.form-group .favicon-label {
  margin: 0;
  font-size: 12px;
  font-weight: 400;
  flex-shrink: 0;
}

.favicon-input input {
  flex: 1;
  min-width: 0;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-text-hint);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.favicon-preview {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg-section);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-hint);
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}

.favicon-preview img {
  transform: scale(var(--icon-scale, 1));
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  object-fit: contain;
}

@media (max-width: 480px) {
  .favicon-layout {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
  }

  .favicon-row,
  .favicon-input {
    gap: 4px;
  }

  .favicon-input input {
    padding: 10px 8px;
  }

  .favicon-header {
    gap: 8px;
    flex-wrap: wrap;
  }

  .favicon-header > label {
    flex-shrink: 0;
  }

  .favicon-scale {
    max-width: none;
  }

  .favicon-header .btn-unified-icon {
    padding: 9px 10px;
    font-size: 12px;
  }

  .favicon-preview {
    width: 44px;
    height: 44px;
  }

  .favicon-preview img {
    width: 32px;
    height: 32px;
  }
}

/* 支持平台复选框样式 */
.platforms-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.platform-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-section);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: var(--transition-base);
}

.platform-checkbox:hover {
  border-color: var(--color-primary);
}

.platform-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  cursor: pointer;
}

.platform-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
}

.platform-label {
  font-size: 13px;
  color: var(--color-text-primary);
  font-weight: 500;
}

/* 图片集样式 */
.btn-add-row {
  font-size: 12px;
  color: var(--color-primary);
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  transition: var(--transition-base);
}

.btn-add-row:hover {
  background: var(--color-primary-light);
}

.image-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

.image-url-input {
  flex: 1;
}

.image-preview {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-section);
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.drag-handle {
  width: 24px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  color: var(--color-text-hint);
  border-radius: 6px;
  transition: var(--transition-base);
}

.drag-handle:hover {
  background: var(--color-btn-secondary);
  color: var(--color-text-secondary);
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-ghost {
  opacity: 0.5;
  background: var(--color-primary-light);
  border-radius: 8px;
}

.drag-chosen {
  background: var(--bg-card);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.drag-dragging {
  opacity: 0.8;
}

/* 按钮行样式 */
.button-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

.btn-icon-select-wrapper {
  position: relative;
  flex: none;
}

.btn-icon-select {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-base);
}

.btn-icon-select:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}

.icon-display {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-display :deep(svg) {
  width: 100%;
  height: 100%;
}

.icon-placeholder {
  color: var(--color-text-hint);
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon-clear {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-danger);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: var(--transition-base);
}

.btn-icon-select-wrapper:hover .btn-icon-clear {
  opacity: 1;
}

.btn-icon-clear:hover {
  transform: scale(1.1);
}

.btn-label-input {
  width: 100px !important;
  flex: none !important;
}

.btn-url-input {
  flex: 1;
}

.btn-remove-row {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-hint);
  transition: var(--transition-base);
}

.btn-remove-row:hover {
  background: #fef0ef;
  color: var(--color-danger);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.btn {
  padding: 9px 22px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: var(--transition-base);
}

.btn-cancel {
  background: var(--color-btn-secondary);
  color: var(--color-text-primary);
}

.btn-cancel:hover {
  background: var(--color-btn-secondary-hover);
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
}

.btn-primary:hover {
  background: #3d7bc7;
}
</style>
