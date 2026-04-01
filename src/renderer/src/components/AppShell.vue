<script setup lang="ts">
import TopBar from '@renderer/components/TopBar.vue'
import Sidebar from '@renderer/components/Sidebar.vue'
import RightSidebar from '@renderer/components/RightSidebar.vue'
import TabBar from '@renderer/components/TabBar.vue'
import TabContent from '@renderer/components/TabContent.vue'
import BottomPanel from '@renderer/components/BottomPanel.vue'
import StatusBar from '@renderer/components/StatusBar.vue'
import ProfileStackPreview from '@renderer/components/ProfileEditor/ProfileStackPreview.vue'
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()
</script>

<template>
  <div class="app-shell">
    <TopBar />
    <div class="app-shell__body">
      <Sidebar />
      <main class="app-shell__main">
        <TabBar />
        <TabContent />
      </main>
      <RightSidebar />
    </div>
    <BottomPanel />
    <StatusBar />
    <ProfileStackPreview v-if="uiStore.stackPreviewOpen" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  background: #1e1e2e;
  color: #cdd6f4;
  font-family: system-ui, -apple-system, sans-serif;
}

.app-shell__body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.app-shell__main {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}
</style>
