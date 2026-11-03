<template>
  <section class="app-about" aria-labelledby="about-heading">
    <h4 id="about-heading">关于</h4>
    <div class="about-content">
      <img
        class="about-icon"
        src="/navsite-logo.png"
        alt="NookNav 应用图标"
        width="56"
        height="56"
      />
      <div class="about-identity">
        <strong>NookNav</strong>
        <span>{{
          navStore.appInfo
            ? `版本 ${navStore.appInfo.version}`
            : navStore.appInfoError
              ? '版本暂不可用'
              : '正在读取版本…'
        }}</span>
      </div>
      <button
        class="about-check"
        type="button"
        :disabled="navStore.checkingUpdates"
        @click="navStore.checkAppUpdates"
      >
        {{ navStore.checkingUpdates ? '正在检查…' : '检查更新' }}
      </button>
    </div>
    <div class="about-status" role="status" aria-live="polite">
      <p v-if="navStore.appInfoError" class="about-error">{{ navStore.appInfoError }}</p>
      <template v-else-if="navStore.updateInfo">
        <p v-if="navStore.updateInfo.status === 'available'">
          发现新版本 {{ navStore.updateInfo.latestVersion }}。
        </p>
        <p v-else-if="navStore.updateInfo.status === 'current'">当前已是最新版本。</p>
        <p v-else-if="navStore.updateInfo.status === 'unpublished'">暂无正式发布版本。</p>
        <p v-else>当前为开发版本，最新正式版为 {{ navStore.updateInfo.latestVersion }}。</p>
        <p
          v-if="
            navStore.updateInfo.status === 'available' && navStore.appInfo?.deployment === 'docker'
          "
        >
          请拉取新版 Docker 镜像并重新创建容器。
        </p>
        <a
          v-if="navStore.updateInfo.releaseUrl"
          :href="navStore.updateInfo.releaseUrl"
          target="_blank"
          rel="noopener noreferrer"
          >查看发布说明 ↗</a
        >
      </template>
    </div>
  </section>
</template>

<script setup>
import { onMounted } from 'vue';
import { useNavStore } from '../stores/navStore.js';
const navStore = useNavStore();
onMounted(() => navStore.fetchAppInfo());
</script>

<style scoped>
.app-about {
  margin-bottom: 24px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
}
h4 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.about-content {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.about-icon {
  border-radius: 12px;
  object-fit: contain;
}
.about-identity {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 120px;
}
.about-identity strong {
  font-size: 18px;
  color: var(--color-text-primary);
}
.about-identity span,
.about-status {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.about-check {
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-btn-secondary);
  color: var(--color-text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.about-check:disabled {
  opacity: 0.6;
  cursor: wait;
}
.about-check:focus-visible {
  outline: 2px solid var(--color-primary, #668fd0);
  outline-offset: 3px;
}
.about-status p {
  margin: 12px 0 0;
  line-height: 1.6;
}
.about-status a {
  display: inline-block;
  margin-top: 10px;
  color: var(--color-primary, #668fd0);
}
.about-error {
  color: var(--color-danger, #c0392b);
}
</style>
