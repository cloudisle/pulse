import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TemplateFolderItem {
  id: string
  name: string
  parentId: string | null
}

export interface TemplateItem {
  id: string
  name: string
  folderId: string | null
}

export const useTemplateStore = defineStore('template', () => {
  const folders = ref<TemplateFolderItem[]>([])
  const templates = ref<TemplateItem[]>([])

  async function list(systemId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const tree = await api.templates.list(systemId)
    const flatFolders: TemplateFolderItem[] = []
    const flatTemplates: TemplateItem[] = []
    flattenTree(tree, flatFolders, flatTemplates)
    folders.value = flatFolders
    templates.value = flatTemplates
  }

  function reset(): void {
    folders.value = []
    templates.value = []
  }

  return { folders, templates, list, reset }
})

function flattenTree(
  tree: { folders?: any[]; templates?: any[] },
  outFolders: TemplateFolderItem[],
  outTemplates: TemplateItem[]
): void {
  for (const t of tree.templates ?? []) {
    outTemplates.push({ id: t.id, name: t.name, folderId: t.folderId })
  }
  for (const node of tree.folders ?? []) {
    outFolders.push({ id: node.folder.id, name: node.folder.name, parentId: node.folder.parentId })
    flattenTree({ folders: node.children, templates: node.templates }, outFolders, outTemplates)
  }
}
