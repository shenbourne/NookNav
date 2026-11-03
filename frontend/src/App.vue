<template>
  <div id="app">
    <NavHeader @openAdmin="handleOpenAdmin" />

    <SearchBar v-model="store.searchQuery" />

    <CategoryTabs
      :categories="store.categories"
      :activeId="store.activeTabId"
      @update:activeId="store.activeTabId = $event"
    />

    <main class="main-content">
      <div v-if="store.loading" class="loading-state">加载中...</div>

      <!-- Search Results -->
      <template v-else-if="store.searchQuery">
        <div class="search-results">
          <div class="results-header">
            搜索结果 <span class="results-count">{{ store.filteredLinks.length }}</span>
          </div>
          <div class="card-grid" v-if="store.filteredLinks.length">
            <LinkCard
              v-for="link in store.filteredLinks"
              :key="link.id"
              :link="link"
              :showActions="authStore.isLoggedIn"
              @edit="openLinkModal(link, link.categoryId, link.subCategoryId)"
              @delete="openDeleteModal('link', link, link.categoryId, link.subCategoryId)"
              @showDetail="handleShowDetail"
            />
          </div>
          <div class="empty-search" v-else>
            没有找到匹配的链接
          </div>
        </div>
      </template>

      <!-- Stream Layout Mode -->
      <template v-else-if="activeCategory?.id === 'cat_001'">
        <StreamLayout
          :categories="store.categories"
          :showActions="authStore.isLoggedIn"
          @editSubCategory="(catId, sub) => openSubCategoryModal(catId, sub)"
          @deleteSubCategory="(catId, sub) => openDeleteModal('subCategory', sub, catId)"
          @addLink="(catId, subId) => openLinkModal(null, catId, subId)"
          @editLink="(link, catId, subId) => openLinkModal(link, catId, subId)"
          @deleteLink="(link, catId, subId) => openDeleteModal('link', link, catId, subId)"
          @addSubCategory="(catId) => openSubCategoryModal(catId)"
          @showDetail="handleShowDetail"
        />
      </template>

      <!-- Paginated Category Content -->
      <template v-else-if="activeCategory">
          <draggable
            v-if="authStore.isLoggedIn"
            v-model="activeCategory.subCategories"
            item-key="id"
            :animation="200"
            ghost-class="sortable-ghost"
            drag-class="sortable-drag"
            handle=".section-header"
            @end="onSubCategoryDragEnd(activeCategory.id)"
          >
            <template #item="{ element: sub }">
              <SubCategorySection
                :subCategory="sub"
                :showActions="true"
                :catId="activeCategory.id"
                :subId="sub.id"
                @edit="openSubCategoryModal(activeCategory.id, sub)"
                @delete="openDeleteModal('subCategory', sub, activeCategory.id)"
                @addLink="openLinkModal(null, activeCategory.id, sub.id)"
                @editLink="(link) => openLinkModal(link, activeCategory.id, sub.id)"
                @deleteLink="(link) => openDeleteModal('link', link, activeCategory.id, sub.id)"
                @showDetail="handleShowDetail"
              />
            </template>
          </draggable>
          <template v-else>
            <SubCategorySection
              v-for="sub in activeCategory.subCategories || []"
              :key="sub.id"
              :subCategory="sub"
              :showActions="false"
              :catId="activeCategory.id"
              :subId="sub.id"
              @edit="openSubCategoryModal(activeCategory.id, sub)"
              @delete="openDeleteModal('subCategory', sub, activeCategory.id)"
              @addLink="openLinkModal(null, activeCategory.id, sub.id)"
              @editLink="(link) => openLinkModal(link, activeCategory.id, sub.id)"
              @deleteLink="(link) => openDeleteModal('link', link, activeCategory.id, sub.id)"
              @showDetail="handleShowDetail"
            />
          </template>

          <div class="add-sub-section" v-if="activeCategory.id !== 'cat_001' && authStore.isLoggedIn">
            <button class="add-sub-btn" @click="openSubCategoryModal(activeCategory.id)">
              + 添加二级分类
            </button>
          </div>
      </template>

      <div v-else class="empty-state">
        <div class="empty-icon">🧭</div>
        <h2>欢迎使用 NookNav</h2>
        <p>点击右上角"管理后台"开始添加分类和链接</p>
      </div>
    </main>

    <!-- Floating Add Button (only when logged in) -->
    <button v-if="authStore.isLoggedIn" class="fab" @click="openLinkModal()" title="添加链接">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>

    <!-- Login Modal -->
    <LoginModal
      :visible="loginModalVisible"
      @close="loginModalVisible = false"
      @success="onLoginSuccess"
    />

    <!-- Admin Modal -->
    <AdminModal
      :visible="adminModalVisible"
      :categories="store.categories"
      :username="authStore.username"
      @close="adminModalVisible = false"
      @logout="handleLogout"
      @changePassword="changePasswordModalVisible = true"
      @changeUsername="changeUsernameModalVisible = true"
      @addCategory="openCategoryModal()"
      @editCategory="openCategoryModal($event)"
      @deleteCategory="openDeleteModal('category', $event)"
      @addSubCategory="openSubCategoryModal($event)"
      @editSubCategory="(catId, sub) => openSubCategoryModal(catId, sub)"
      @deleteSubCategory="(catId, sub) => openDeleteModal('subCategory', sub, catId)"
      @moveSubCategory="handleMoveSubCategory"
    />

    <!-- Category Modal -->
    <CategoryFormModal
      :visible="categoryModalVisible"
      :category="editingCategory"
      @close="categoryModalVisible = false"
      @submit="handleCategorySubmit"
    />

    <!-- SubCategory Modal -->
    <SubCategoryFormModal
      :visible="subCategoryModalVisible"
      :subCategory="editingSubCategory"
      @close="subCategoryModalVisible = false"
      @submit="handleSubCategorySubmit"
    />

    <!-- Link Modal -->
    <LinkFormModal
      :visible="linkModalVisible"
      :link="editingLink"
      :categoryId="editingCategoryId"
      :subCategoryId="editingSubCategoryId"
      :categories="store.categories"
      @close="linkModalVisible = false"
      @submit="handleLinkSubmit"
    />

    <!-- Link Detail Modal -->
    <LinkDetailModal
      :visible="linkDetailModalVisible"
      :link="currentDetailLink"
      @close="linkDetailModalVisible = false"
    />

    <!-- Confirm Delete Modal -->
    <ConfirmModal
      :visible="deleteModalVisible"
      :message="deleteMessage"
      @cancel="deleteModalVisible = false"
      @confirm="handleDelete"
    />

    <!-- Change Password Modal -->
    <ChangePasswordModal
      :visible="changePasswordModalVisible"
      @close="changePasswordModalVisible = false"
    />

    <!-- Change Username Modal -->
    <ChangeUsernameModal
      :visible="changeUsernameModalVisible"
      @close="changeUsernameModalVisible = false"
    />

    <!-- Link Detail Modal -->
    <LinkDetailModal
      :visible="linkDetailModalVisible"
      :link="currentDetailLink"
      @close="linkDetailModalVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watchEffect } from 'vue'
import { useNavStore } from './stores/navStore.js'
import { useAuthStore } from './stores/authStore.js'
import draggable from 'vuedraggable'
import NavHeader from './components/NavHeader.vue'
import SearchBar from './components/SearchBar.vue'
import CategoryTabs from './components/CategoryTabs.vue'
import SubCategorySection from './components/SubCategorySection.vue'
import StreamLayout from './components/StreamLayout.vue'
import LinkCard from './components/LinkCard.vue'
import LoginModal from './components/modals/LoginModal.vue'
import AdminModal from './components/modals/AdminModal.vue'
import CategoryFormModal from './components/modals/CategoryFormModal.vue'
import SubCategoryFormModal from './components/modals/SubCategoryFormModal.vue'
import LinkFormModal from './components/modals/LinkFormModal.vue'
import LinkDetailModal from './components/modals/LinkDetailModal.vue'
import ChangePasswordModal from './components/modals/ChangePasswordModal.vue'
import ChangeUsernameModal from './components/modals/ChangeUsernameModal.vue'
import ConfirmModal from './components/modals/ConfirmModal.vue'

const store = useNavStore()
const authStore = useAuthStore()

onMounted(() => {
  store.fetchAll()
})

watchEffect(() => {
  document.title = store.siteSettings.title || 'NookNav 的主页'

  const link = document.querySelector("link[rel~='icon']")
  if (link) {
    link.href = store.accelerateUrl(store.siteSettings.logoUrl) || '/navsite-logo.png'
    link.removeAttribute('type')
  }
})

const activeCategory = computed(() => {
  return store.categories.find(c => c.id === store.activeTabId)
})

async function onSubCategoryDragEnd(catId) {
  const cat = store.categories.find(c => c.id === catId)
  if (!cat || !cat.subCategories) return
  const orderedIds = cat.subCategories.map(s => s.id)
  try {
    await store.reorderSubCategories(catId, orderedIds)
  } catch (err) {
    console.error('Failed to reorder sub-categories:', err)
  }
}

// --- Login modal ---
const loginModalVisible = ref(false)
let pendingAuthenticatedAction = null
let checkingAuth = false

async function openAuthenticated(action) {
  if (checkingAuth) return
  checkingAuth = true
  try {
    if (await authStore.checkAuth()) {
      pendingAuthenticatedAction = null
      action()
    } else {
      pendingAuthenticatedAction = action
      loginModalVisible.value = true
    }
  } catch {
    alert('暂时无法验证登录状态，请检查连接后重试')
  } finally {
    checkingAuth = false
  }
}

function handleOpenAdmin() {
  openAuthenticated(() => { adminModalVisible.value = true })
}

function onLoginSuccess() {
  const action = pendingAuthenticatedAction
  pendingAuthenticatedAction = null
  if (action) action()
  else adminModalVisible.value = true
}

function handleLogout() {
  authStore.logout()
  adminModalVisible.value = false
}

// --- Admin modal ---
const adminModalVisible = ref(false)

// --- Change password modal ---
const changePasswordModalVisible = ref(false)

// --- Change username modal ---
const changeUsernameModalVisible = ref(false)

// --- Link Detail modal ---
const linkDetailModalVisible = ref(false)
const selectedDetailLink = ref({ title: '', url: '' })
const currentDetailLink = computed(() =>
  store.allLinks.find(link => link.id === selectedDetailLink.value.id) || selectedDetailLink.value
)

function handleShowDetail(link) {
  selectedDetailLink.value = link
  linkDetailModalVisible.value = true
}

// --- Category modal ---
const categoryModalVisible = ref(false)
const editingCategory = ref(null)

function openCategoryModal(cat = null) {
  openAuthenticated(() => {
    editingCategory.value = cat
    categoryModalVisible.value = true
  })
}

async function handleCategorySubmit(payload) {
  try {
    if (editingCategory.value) {
      await store.updateCategory(editingCategory.value.id, payload)
    } else {
      await store.addCategory(payload)
    }
    categoryModalVisible.value = false
  } catch (err) {
    alert(err.response?.data?.error || '操作失败')
  }
}

// --- SubCategory modal ---
const subCategoryModalVisible = ref(false)
const editingSubCategory = ref(null)
const editingParentCatId = ref('')

function openSubCategoryModal(catId, sub = null) {
  openAuthenticated(() => {
    editingParentCatId.value = catId
    editingSubCategory.value = sub
    subCategoryModalVisible.value = true
  })
}

async function handleSubCategorySubmit(payload) {
  try {
    if (editingSubCategory.value) {
      await store.updateSubCategory(editingParentCatId.value, editingSubCategory.value.id, payload)
    } else {
      await store.addSubCategory(editingParentCatId.value, payload)
    }
    subCategoryModalVisible.value = false
  } catch (err) {
    alert(err.response?.data?.error || '操作失败')
  }
}

async function handleMoveSubCategory(subId, fromCatId, toCatId) {
  try {
    await store.moveSubCategory(subId, fromCatId, toCatId)
  } catch (err) {
    alert(err.response?.data?.error || '移动失败')
  }
}

// --- Link modal ---
const linkModalVisible = ref(false)
const editingLink = ref(null)
const editingCategoryId = ref('')
const editingSubCategoryId = ref('')

function openLinkModal(link = null, catId = '', subId = '') {
  openAuthenticated(() => {
    editingLink.value = link
    editingCategoryId.value = catId || (activeCategory.value?.id !== 'cat_001' ? activeCategory.value?.id : '')
    editingSubCategoryId.value = subId
    linkModalVisible.value = true
  })
}

async function handleLinkSubmit({ isEdit, linkId, categoryId, subCategoryId, data }) {
  try {
    if (isEdit) {
      const origCatId = editingCategoryId.value
      const origSubId = editingSubCategoryId.value
      if (categoryId !== origCatId || subCategoryId !== origSubId) {
        await store.moveLink(linkId, origCatId, origSubId, categoryId, subCategoryId, data)
      } else {
        await store.updateLink(categoryId, subCategoryId, linkId, data)
      }
    } else {
      await store.addLink(categoryId, subCategoryId, data)
    }
    linkModalVisible.value = false
  } catch (err) {
    alert(err.response?.data?.error || '操作失败')
  }
}

// --- Delete modal ---
const deleteModalVisible = ref(false)
const deleteMessage = ref('')
const deleteTarget = ref({ type: '', id: '', catId: '', subId: '' })

function openDeleteModal(type, item, catId = '', subId = '') {
  deleteTarget.value = { type, id: item.id, catId, subId }
  if (type === 'category') {
    deleteMessage.value = `确定要删除分类"${item.name}"及其所有内容吗？`
  } else if (type === 'subCategory') {
    deleteMessage.value = `确定要删除二级分类"${item.name}"及其所有链接吗？`
  } else {
    deleteMessage.value = `确定要删除"${item.title || item.url}"吗？`
  }
  deleteModalVisible.value = true
}

async function handleDelete() {
  try {
    const { type, id, catId, subId } = deleteTarget.value
    if (type === 'category') {
      await store.deleteCategory(id)
    } else if (type === 'subCategory') {
      await store.deleteSubCategory(catId, id)
    } else {
      await store.deleteLink(catId, subId, id)
    }
    deleteModalVisible.value = false
  } catch (err) {
    alert(err.response?.data?.error || '操作失败')
  }
}
</script>

<style scoped>
#app {
  min-height: 100vh;
  background: var(--bg-page);
}

.main-content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 32px 80px;
}

.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-hint);
  font-size: 15px;
}

.search-results {
  margin-bottom: 24px;
}

.results-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.results-count {
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 2px 8px;
  border-radius: 10px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}

.empty-search {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-hint);
  font-size: 14px;
}

.add-sub-section {
  margin-top: 16px;
}

.add-sub-btn {
  width: 100%;
  padding: 14px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-card);
  color: var(--color-text-hint);
  font-size: 14px;
  transition: var(--transition-base);
}

.add-sub-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-light);
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
}

.empty-icon {
  font-size: 56px;
  margin-bottom: 16px;
}

.empty-state h2 {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--color-text-primary);
}

.empty-state p {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.fab {
  position: fixed;
  bottom: 32px;
  right: 32px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(74, 144, 217, 0.4);
  transition: var(--transition-base);
  z-index: 100;
}

.fab:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 28px rgba(74, 144, 217, 0.5);
}

@media (max-width: 640px) {
  .main-content {
    padding: 16px 16px 100px;
  }

  .card-grid {
    grid-template-columns: 1fr;
  }

  .fab {
    bottom: 24px;
    right: 24px;
    width: 52px;
    height: 52px;
  }
}
</style>
