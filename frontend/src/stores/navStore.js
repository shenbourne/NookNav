import { defineStore } from 'pinia'
import { ref, computed, watch, onScopeDispose } from 'vue'
import { useAuthStore } from './authStore.js'
import api from '../composables/useApi.js'

export const useNavStore = defineStore('nav', () => {
  const categories = ref([])
  const loading = ref(false)
  const activeTabId = ref('')
  const searchQuery = ref('')
  const siteSettings = ref({
    title: 'My Nav 的主页',
    logoUrl: '',
    githubJsdelivr: false,
    localIcons: true,
    localGallery: false,
    galleryAutoPlay: true,
    galleryAutoPlayInterval: 5000,
    galleryTransition: 'fade',
    galleryMasonryAutoScroll: true,
    galleryMasonryScrollSpeed: 20,
    galleryDefaultMode: 'carousel',
    galleryCarouselTimeout: 10000,
  })

  const authStore = useAuthStore()
  const imageStorageStatus = ref(null)
  let statusRequest = null
  let appliedRevision = null
  let migrationTimer = null
  let migrationGeneration = 0
  let disposed = false

  async function refreshCategories() {
    const { data: res } = await api.get('/categories')
    if (!res.success) throw new Error(res.error || '无法刷新分类')
    categories.value = res.data
  }

  async function applyImageStorageStatus(status) {
    if (!authStore.isLoggedIn || disposed) return null
    imageStorageStatus.value = status
    if (status.revision !== appliedRevision) {
      await refreshCategories()
      appliedRevision = status.revision
    }
    return status
  }

  async function fetchImageStorageStatus() {
    if (!authStore.isLoggedIn || disposed) return null
    if (statusRequest) return statusRequest
    statusRequest = (async () => {
      const { data: res } = await api.get('/settings/image-storage')
      if (!res.success) throw new Error(res.error || '无法获取图片存储状态')
      return applyImageStorageStatus(res.data)
    })()
    try {
      return await statusRequest
    } finally {
      statusRequest = null
    }
  }

  async function retryImageStorage() {
    if (!authStore.isLoggedIn || disposed) return null
    const { data: res } = await api.post('/settings/image-storage/retry')
    if (!res.success) throw new Error(res.error || '重试失败')
    const status = await applyImageStorageStatus(res.data)
    startImageStoragePolling()
    return status
  }

  function stopImageStoragePolling() {
    migrationGeneration++
    clearTimeout(migrationTimer)
    migrationTimer = null
  }

  // Briefly follow queued work after loads/mutations, even outside the admin modal.
  // Stop after idle confirmation or five minutes; never poll as an anonymous visitor.
  function startImageStoragePolling() {
    stopImageStoragePolling()
    if (!authStore.isLoggedIn || disposed) return
    const generation = migrationGeneration
    const deadline = Date.now() + 5 * 60 * 1000
    let idleChecks = 0
    async function tick() {
      if (generation !== migrationGeneration || !authStore.isLoggedIn || disposed) return
      try {
        const status = await fetchImageStorageStatus()
        if (!status) return
        idleChecks = status.running ? 0 : idleChecks + 1
      } catch {
        return // A later load or mutation can try again.
      }
      if (generation !== migrationGeneration || !authStore.isLoggedIn || disposed) return
      if (Date.now() < deadline && idleChecks < 3) migrationTimer = setTimeout(tick, 2000)
    }
    migrationTimer = setTimeout(tick, 500)
  }

  watch(() => authStore.isLoggedIn, (loggedIn) => {
    if (loggedIn) startImageStoragePolling()
    else {
      stopImageStoragePolling()
      imageStorageStatus.value = null
      appliedRevision = null
    }
  }, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    stopImageStoragePolling()
  })

  // Get all links across all categories for "全部" tab
  const allLinks = computed(() => {
    const links = []
    categories.value.forEach(cat => {
      if (cat.subCategories) {
        cat.subCategories.forEach(sub => {
          if (sub.links) {
            sub.links.forEach(link => {
              links.push({
                ...link,
                categoryId: cat.id,
                categoryName: cat.name,
                subCategoryId: sub.id,
                subCategoryName: sub.name,
                subCategoryColor: sub.color,
              })
            })
          }
        })
      }
    })
    return links
  })

  // Filter links by search query
  const filteredLinks = computed(() => {
    if (!searchQuery.value.trim()) return allLinks.value
    const q = searchQuery.value.toLowerCase()
    return allLinks.value.filter(link =>
      link.title.toLowerCase().includes(q) ||
      link.description.toLowerCase().includes(q) ||
      link.url.toLowerCase().includes(q)
    )
  })

  async function fetchAll() {
    loading.value = true
    try {
      const [catRes, settingsRes] = await Promise.all([
        api.get('/categories'),
        api.get('/settings'),
      ])
      if (catRes.data.success) {
        categories.value = catRes.data.data
        if (catRes.data.data.length && !activeTabId.value) {
          activeTabId.value = catRes.data.data[0].id
        }
      }
      if (settingsRes.data.success) {
        siteSettings.value = { localIcons: true, localGallery: false, ...settingsRes.data.data }
      }
    } finally {
      loading.value = false
      startImageStoragePolling()
    }
  }

  // --- Top-level Category ---

  async function addCategory(payload) {
    const { data: res } = await api.post('/categories', payload)
    if (res.success) {
      categories.value.push(res.data)
    }
    return res.data
  }

  async function updateCategory(catId, payload) {
    const { data: res } = await api.put(`/categories/${catId}`, payload)
    if (res.success) {
      const idx = categories.value.findIndex(c => c.id === catId)
      if (idx !== -1) Object.assign(categories.value[idx], res.data)
    }
  }

  async function deleteCategory(catId) {
    const { data: res } = await api.delete(`/categories/${catId}`)
    if (res.success) {
      categories.value = categories.value.filter(c => c.id !== catId)
      if (activeTabId.value === catId && categories.value.length) {
        activeTabId.value = categories.value[0].id
      }
    }
  }

  // --- SubCategory (二级分类) ---

  async function addSubCategory(catId, payload) {
    const { data: res } = await api.post(`/categories/${catId}/subcategories`, payload)
    if (res.success) {
      const cat = categories.value.find(c => c.id === catId)
      if (cat) {
        if (!cat.subCategories) cat.subCategories = []
        cat.subCategories.push(res.data)
      }
    }
    return res.data
  }

  async function updateSubCategory(catId, subId, payload) {
    const { data: res } = await api.put(`/categories/${catId}/subcategories/${subId}`, payload)
    if (res.success) {
      const cat = categories.value.find(c => c.id === catId)
      if (cat && cat.subCategories) {
        const idx = cat.subCategories.findIndex(s => s.id === subId)
        if (idx !== -1) Object.assign(cat.subCategories[idx], res.data)
      }
    }
  }

  async function deleteSubCategory(catId, subId) {
    const { data: res } = await api.delete(`/categories/${catId}/subcategories/${subId}`)
    if (res.success) {
      const cat = categories.value.find(c => c.id === catId)
      if (cat && cat.subCategories) {
        cat.subCategories = cat.subCategories.filter(s => s.id !== subId)
      }
    }
  }

  async function moveSubCategory(subId, fromCatId, toCatId) {
    const { data: res } = await api.post('/subcategories/move', { subId, fromCatId, toCatId })
    if (res.success) {
      startImageStoragePolling()
      const fromCat = categories.value.find(c => c.id === fromCatId)
      if (fromCat && fromCat.subCategories) {
        fromCat.subCategories = fromCat.subCategories.filter(s => s.id !== subId)
      }
      const toCat = categories.value.find(c => c.id === toCatId)
      if (toCat) {
        if (!toCat.subCategories) toCat.subCategories = []
        toCat.subCategories.push(res.data)
      }
    }
  }

  // --- Links ---

  async function addLink(catId, subId, payload) {
    const { data: res } = await api.post(`/categories/${catId}/subcategories/${subId}/links`, payload)
    if (res.success) {
      startImageStoragePolling()
      const cat = categories.value.find(c => c.id === catId)
      if (cat && cat.subCategories) {
        const sub = cat.subCategories.find(s => s.id === subId)
        if (sub) sub.links.push(res.data)
      }
    }
    return res.data
  }

  async function updateLink(catId, subId, linkId, payload) {
    const { data: res } = await api.put(`/categories/${catId}/subcategories/${subId}/links/${linkId}`, payload)
    if (res.success) {
      startImageStoragePolling()
      const cat = categories.value.find(c => c.id === catId)
      if (cat && cat.subCategories) {
        const sub = cat.subCategories.find(s => s.id === subId)
        if (sub) {
          const idx = sub.links.findIndex(l => l.id === linkId)
          if (idx !== -1) Object.assign(sub.links[idx], res.data)
        }
      }
    }
  }

  async function moveLink(linkId, fromCatId, fromSubId, toCatId, toSubId, payload) {
    const { data: res } = await api.post('/links/move', {
      linkId, fromCatId, fromSubId, toCatId, toSubId, data: payload,
    })
    if (res.success) {
      startImageStoragePolling()
      // Remove from source
      const fromCat = categories.value.find(c => c.id === fromCatId)
      if (fromCat && fromCat.subCategories) {
        const fromSub = fromCat.subCategories.find(s => s.id === fromSubId)
        if (fromSub) fromSub.links = fromSub.links.filter(l => l.id !== linkId)
      }
      // Add to destination
      const toCat = categories.value.find(c => c.id === toCatId)
      if (toCat && toCat.subCategories) {
        const toSub = toCat.subCategories.find(s => s.id === toSubId)
        if (toSub) toSub.links.push(res.data)
      }
    }
  }

  async function deleteLink(catId, subId, linkId) {
    const { data: res } = await api.delete(`/categories/${catId}/subcategories/${subId}/links/${linkId}`)
    if (res.success) {
      const cat = categories.value.find(c => c.id === catId)
      if (cat && cat.subCategories) {
        const sub = cat.subCategories.find(s => s.id === subId)
        if (sub) sub.links = sub.links.filter(l => l.id !== linkId)
      }
    }
  }

  async function fetchMeta(url, options = {}) {
    const { data: res } = await api.post('/fetch-meta', { url, skipIconSource: options.skipIconSource })
    return res.success ? res.data : null
  }

  async function matchIcons(url) {
    const { data: res } = await api.post('/match-icons', { url })
    return res.success ? res.data : []
  }

  async function searchDashboardIcons(query, limit = 20) {
    const { data: res } = await api.post('/search-dashboard-icons', { query, limit })
    return res.success ? res.data : []
  }

  async function searchLobeIcons(query, limit = 20) {
    const { data: res } = await api.post('/search-lobe-icons', { query, limit })
    return res.success ? res.data : []
  }

  // --- Site settings ---

  async function updateSettings(payload) {
    const { data: res } = await api.put('/settings', payload)
    if (res.success) {
      siteSettings.value = { localIcons: true, localGallery: false, ...res.data }
      await refreshCategories()
      startImageStoragePolling()
    }
  }

  async function uploadLogo(file) {
    const formData = new FormData()
    formData.append('logo', file)
    const { data: res } = await api.post('/settings/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    if (res.success) {
      siteSettings.value.logoUrl = res.data.logoUrl
    }
  }

  // 将 GitHub raw 直链转换为 jsdelivr 加速链接
  function accelerateUrl(url) {
    if (!url || !siteSettings.value.githubJsdelivr) return url
    return url.replace(
      /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/,
      'https://cdn.jsdelivr.net/gh/$1/$2@$3/$4'
    )
  }

  // --- Reorder ---

  async function reorderCategories(orderedIds) {
    await api.put('/categories/reorder', { orderedIds })
    // Update local order
    const catMap = new Map(categories.value.map(c => [c.id, c]))
    orderedIds.forEach((id, index) => {
      const cat = catMap.get(id)
      if (cat) cat.order = index
    })
    categories.value.sort((a, b) => a.order - b.order)
  }

  async function reorderSubCategories(catId, orderedIds) {
    await api.put(`/categories/${catId}/subcategories/reorder`, { orderedIds })
    const cat = categories.value.find(c => c.id === catId)
    if (cat && cat.subCategories) {
      const subMap = new Map(cat.subCategories.map(s => [s.id, s]))
      orderedIds.forEach((id, index) => {
        const sub = subMap.get(id)
        if (sub) sub.order = index
      })
      cat.subCategories.sort((a, b) => a.order - b.order)
    }
  }

  async function reorderLinks(catId, subId, orderedIds) {
    await api.put(`/categories/${catId}/subcategories/${subId}/links/reorder`, { orderedIds })
    const cat = categories.value.find(c => c.id === catId)
    if (cat && cat.subCategories) {
      const sub = cat.subCategories.find(s => s.id === subId)
      if (sub && sub.links) {
        const linkMap = new Map(sub.links.map(l => [l.id, l]))
        orderedIds.forEach((id, index) => {
          const link = linkMap.get(id)
          if (link) link.order = index
        })
        sub.links.sort((a, b) => a.order - b.order)
      }
    }
  }

  return {
    categories,
    loading,
    activeTabId,
    searchQuery,
    siteSettings,
    imageStorageStatus,
    fetchImageStorageStatus,
    retryImageStorage,
    allLinks,
    filteredLinks,
    fetchAll,
    addCategory,
    updateCategory,
    deleteCategory,
    addSubCategory,
    updateSubCategory,
    deleteSubCategory,
    moveSubCategory,
    addLink,
    updateLink,
    moveLink,
    deleteLink,
    fetchMeta,
    matchIcons,
    searchDashboardIcons,
    searchLobeIcons,
    updateSettings,
    uploadLogo,
    accelerateUrl,
    reorderCategories,
    reorderSubCategories,
    reorderLinks,
  }
})
