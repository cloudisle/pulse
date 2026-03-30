import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Tab {
  id: string
  type: string
  title: string
}

export const useUiStore = defineStore('ui', () => {
  const openTabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const sidebarCollapsed = ref(false)
  const bottomPanelCollapsed = ref(false)
  const bottomPanelHeight = ref(200)
  const rightSidebarCollapsed = ref(false)
  const rightSidebarWidth = ref(300)
  const stackPreviewOpen = ref(false)

  function openTab(tab: Tab): void {
    const existing = openTabs.value.find((t) => t.id === tab.id)
    if (!existing) {
      openTabs.value.push(tab)
    }
    activeTabId.value = tab.id
  }

  function closeTab(id: string): void {
    const idx = openTabs.value.findIndex((t) => t.id === id)
    if (idx === -1) return
    openTabs.value.splice(idx, 1)
    if (activeTabId.value === id) {
      activeTabId.value = openTabs.value.length > 0 ? openTabs.value[Math.max(0, idx - 1)].id : null
    }
  }

  function setActiveTab(id: string): void {
    activeTabId.value = id
  }

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function toggleBottomPanel(): void {
    bottomPanelCollapsed.value = !bottomPanelCollapsed.value
  }

  function setBottomPanelHeight(height: number): void {
    bottomPanelHeight.value = height
  }

  function toggleRightSidebar(): void {
    rightSidebarCollapsed.value = !rightSidebarCollapsed.value
  }

  function setRightSidebarWidth(width: number): void {
    rightSidebarWidth.value = width
  }

  function openStackPreview(): void {
    stackPreviewOpen.value = true
  }

  function closeStackPreview(): void {
    stackPreviewOpen.value = false
  }

  return {
    openTabs,
    activeTabId,
    sidebarCollapsed,
    bottomPanelCollapsed,
    bottomPanelHeight,
    rightSidebarCollapsed,
    rightSidebarWidth,
    stackPreviewOpen,
    openTab,
    closeTab,
    setActiveTab,
    toggleSidebar,
    toggleBottomPanel,
    setBottomPanelHeight,
    toggleRightSidebar,
    setRightSidebarWidth,
    openStackPreview,
    closeStackPreview
  }
})
