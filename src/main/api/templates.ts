import { randomUUID } from 'crypto'
import path from 'path'
import { StorageService, StoragePaths } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'
import type {
  Template,
  TemplateFolder,
  TemplateFolderNode,
  TemplateTree
} from '@shared/models/template'
import type { Schema, SchemaElement } from '@shared/models/schema'
import type { CreateTemplateInput, UpdateTemplateInput } from '@shared/dto/templates'

export class TemplatesApi {

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService
  ) {}

  // ---------------------------------------------------------------------------
  // Folder operations
  // ---------------------------------------------------------------------------

  async createFolder(
    systemId: string,
    name: string,
    parentId: string | null
  ): Promise<TemplateFolder> {
    const dataDir = await this.settings.getDataPath()
    const folders = await this.loadFolders(dataDir, systemId)

    const folder: TemplateFolder = {
      id: randomUUID(),
      systemId,
      parentId,
      name
    }

    folders.push(folder)
    await this.storage.write(StoragePaths.templateFolders(dataDir, systemId), folders)
    return folder
  }

  async updateFolder(systemId: string, folderId: string, name: string): Promise<TemplateFolder> {
    const dataDir = await this.settings.getDataPath()
    const folders = await this.loadFolders(dataDir, systemId)

    const index = folders.findIndex((f) => f.id === folderId)
    if (index === -1) {
      throw new Error(`Template folder not found: ${folderId}`)
    }

    folders[index] = { ...folders[index], name }
    await this.storage.write(StoragePaths.templateFolders(dataDir, systemId), folders)
    return folders[index]
  }

  async deleteFolder(systemId: string, folderId: string): Promise<void> {
    const dataDir = await this.settings.getDataPath()
    await this.deleteFolderRecursive(dataDir, systemId, folderId)
  }

  // ---------------------------------------------------------------------------
  // Template operations
  // ---------------------------------------------------------------------------

  async list(systemId: string): Promise<TemplateTree> {
    const dataDir = await this.settings.getDataPath()
    const folders = await this.loadFolders(dataDir, systemId)
    const templates = await this.loadAllTemplates(dataDir, systemId)
    return this.buildTree(folders, templates)
  }

  async get(systemId: string, id: string): Promise<Template> {
    const dataDir = await this.settings.getDataPath()
    const template = await this.storage.read<Template>(
      StoragePaths.template(dataDir, systemId, id)
    )
    if (template === null) {
      throw new Error(`Template not found: ${id}`)
    }
    return template
  }

  async create(data: CreateTemplateInput): Promise<Template> {
    const dataDir = await this.settings.getDataPath()
    await this.validateRequiredFields(dataDir, data)

    const now = new Date().toISOString()
    const template: Template = {
      id: randomUUID(),
      systemId: data.systemId,
      folderId: data.folderId,
      name: data.name,
      description: data.description,
      schemaId: data.schemaId,
      inputId: data.inputId,
      profileIds: data.profileIds,
      fields: data.fields,
      createdAt: now,
      updatedAt: now
    }

    await this.storage.write(
      StoragePaths.template(dataDir, data.systemId, template.id),
      template
    )
    return template
  }

  async update(systemId: string, id: string, data: UpdateTemplateInput): Promise<Template> {
    const current = await this.get(systemId, id)
    const dataDir = await this.settings.getDataPath()

    const updated: Template = {
      ...current,
      ...data,
      updatedAt: new Date().toISOString()
    }

    await this.storage.write(StoragePaths.template(dataDir, systemId, id), updated)
    return updated
  }

  async delete(systemId: string, id: string): Promise<void> {
    const dataDir = await this.settings.getDataPath()
    await this.storage.delete(StoragePaths.template(dataDir, systemId, id))
  }

  async move(systemId: string, id: string, targetFolderId: string | null): Promise<Template> {
    const current = await this.get(systemId, id)
    const dataDir = await this.settings.getDataPath()

    const updated: Template = {
      ...current,
      folderId: targetFolderId,
      updatedAt: new Date().toISOString()
    }

    await this.storage.write(StoragePaths.template(dataDir, systemId, id), updated)
    return updated
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadFolders(dataDir: string, systemId: string): Promise<TemplateFolder[]> {
    const folders = await this.storage.read<TemplateFolder[]>(
      StoragePaths.templateFolders(dataDir, systemId)
    )
    return folders ?? []
  }

  private async loadAllTemplates(dataDir: string, systemId: string): Promise<Template[]> {
    const templatesDir = path.join(dataDir, 'systems', systemId, 'templates')

    let files: string[]
    try {
      files = await this.storage.listDir(templatesDir)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw err
    }

    const templates: Template[] = []
    for (const file of files.filter((f) => f.endsWith('.json') && f !== 'folders.json')) {
      const id = file.slice(0, -5)
      const template = await this.storage.read<Template>(
        StoragePaths.template(dataDir, systemId, id)
      )
      if (template !== null) {
        templates.push(template)
      }
    }
    return templates
  }

  private buildTree(folders: TemplateFolder[], templates: Template[]): TemplateTree {
    const buildNode = (folder: TemplateFolder): TemplateFolderNode => {
      const children = folders.filter((f) => f.parentId === folder.id).map(buildNode)
      const folderTemplates = templates.filter((t) => t.folderId === folder.id)
      return { folder, children, templates: folderTemplates }
    }

    const rootFolders = folders.filter((f) => f.parentId === null).map(buildNode)
    const rootTemplates = templates.filter((t) => t.folderId === null)
    return { folders: rootFolders, templates: rootTemplates }
  }

  private async deleteFolderRecursive(
    dataDir: string,
    systemId: string,
    folderId: string
  ): Promise<void> {
    const folders = await this.loadFolders(dataDir, systemId)
    const templates = await this.loadAllTemplates(dataDir, systemId)

    // Collect this folder and all descendant folder IDs
    const folderIdsToDelete = new Set<string>()
    const collectIds = (id: string): void => {
      folderIdsToDelete.add(id)
      for (const child of folders.filter((f) => f.parentId === id)) {
        collectIds(child.id)
      }
    }
    collectIds(folderId)

    // Delete all templates that belong to any of those folders
    for (const template of templates) {
      if (template.folderId !== null && folderIdsToDelete.has(template.folderId)) {
        await this.storage.delete(StoragePaths.template(dataDir, systemId, template.id))
      }
    }

    // Persist the updated folders list (without the deleted folder subtree)
    const updatedFolders = folders.filter((f) => !folderIdsToDelete.has(f.id))
    await this.storage.write(StoragePaths.templateFolders(dataDir, systemId), updatedFolders)
  }

  private async validateRequiredFields(
    dataDir: string,
    data: CreateTemplateInput
  ): Promise<void> {
    const schema = await this.storage.read<Schema>(
      StoragePaths.schema(dataDir, data.systemId, data.schemaId)
    )
    if (schema === null) {
      throw new Error(`Schema not found: ${data.schemaId}`)
    }

    const requiredPaths = this.collectRequiredPaths(schema.elements, '')

    for (const reqPath of requiredPaths) {
      const field = data.fields.find((f) => f.elementPath === reqPath)
      // A required field is satisfied if it has an explicit entry with any action.
      // For 'set' action, a defined value is also required.
      if (!field || (field.action === 'set' && field.value === undefined)) {
        throw new Error(`Required field "${reqPath}" must be set or marked as omitted`)
      }
    }
  }

  private collectRequiredPaths(elements: SchemaElement[], parentPath: string): string[] {
    const paths: string[] = []
    for (const element of elements) {
      const elementPath = parentPath ? `${parentPath}.${element.name}` : element.name
      if (element.required) {
        paths.push(elementPath)
      }
      if (element.children && element.children.length > 0) {
        paths.push(...this.collectRequiredPaths(element.children, elementPath))
      }
    }
    return paths
  }
}
