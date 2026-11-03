<template>
  <header class="nav-header">
    <div class="header-title">
      <img class="header-logo" :src="navStore.accelerateUrl(navStore.siteSettings.logoUrl) || '/navsite-logo.png'" alt="Logo" />
      <span>{{ navStore.siteSettings.title || 'NookNav 的主页' }}</span>
    </div>
    <div class="header-actions">
      <!-- Theme toggle -->
      <div class="toggle-group">
        <button
          class="toggle-btn"
          :class="{ active: uiStore.theme === 'light' }"
          @click="uiStore.setTheme('light')"
          title="亮色模式"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </button>
        <button
          class="toggle-btn"
          :class="{ active: uiStore.theme === 'dark' }"
          @click="uiStore.setTheme('dark')"
          title="暗色模式"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <button
          class="toggle-btn"
          :class="{ active: uiStore.theme === 'system' }"
          @click="uiStore.setTheme('system')"
          title="跟随系统"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        </button>
      </div>

      <button class="admin-btn" @click="$emit('openAdmin')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        管理后台
      </button>
    </div>
  </header>
</template>

<script setup>
import { useUiStore } from '../stores/uiStore.js'
import { useNavStore } from '../stores/navStore.js'

defineEmits(['openAdmin'])

const uiStore = useUiStore()
const navStore = useNavStore()
</script>

<style scoped>
.nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 32px;
  background: var(--header-gradient);
  color: #fff;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
}

.header-icon {
  width: 22px;
  height: 22px;
}

.header-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 4px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle-group {
  display: flex;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 2px;
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.6);
  transition: var(--transition-base);
}

.toggle-btn:hover {
  color: rgba(255, 255, 255, 0.9);
}

.toggle-btn.active {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.admin-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  border-radius: 4px;
  transition: var(--transition-base);
}

.admin-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

@media (max-width: 640px) {
  .nav-header {
    padding: 14px 16px;
  }

  .header-title {
    font-size: 16px;
  }

  .toggle-group {
    display: none;
  }
}
</style>
