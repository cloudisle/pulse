import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

import { StorageService, StoragePaths } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'
import { TemplatesApi } from '@main/api/templates'
import type { Template, TemplateFolder } from '@shared/models/template'
import type { Schema, SchemaElement } from '@shared/models/schema'
import type { CreateTemplateInput } from '@shared/dto/templates'

let tmpDir: string
let storage: StorageService
let api: TemplatesApi

const SYS_ID = 'sys-1'

const requiredElement: SchemaElement = {
  name: 'orderId',
  required: true,
  dataType: { type: 'string' },
  generationStrategy: { type: 'faker', config: { method: 'string.uuid' } }
}

const optionalElement: SchemaElement = {
  name: 'note',
  required: false,
  dataType: { type: 'string' },
  generationStrategy: { type: 'random', config: {} }
}

/** Write a minimal Schema to disk and return it. */
async function seedSchema(
  schemaId: string,
  elements: SchemaElement[] = [requiredElement]
): Promise<Schema> {
  const schema: Schema = {
    id: schemaId,
    systemId: SYS_ID,
    name: 'TestSchema',
    elements,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  await storage.write(StoragePaths.schema(tmpDir, SYS_ID, schemaId), schema)
  return schema
}

/** Build a valid CreateTemplateInput with the required field covered. */
function makeInput(schemaId: string, overrides: Partial<CreateTemplateInput> = {}): CreateTemplateInput {
  return {
    systemId: SYS_ID,
    folderId: null,
    name: 'My Template',
    schemaId,
    inputId: 'input-1',
    profileIds: [],
    fields: [{ elementPath: 'orderId', action: 'set', value: 'order-123' }],
    ...overrides
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-templates-test-'))
  storage = new StorageService()
  const settings = new SettingsService(storage, tmpDir)
  api = new TemplatesApi(storage, settings)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Folder — create
// ---------------------------------------------------------------------------

describe('TemplatesApi — createFolder', () => {
  it('returns a folder with a generated id', async () => {
    const folder = await api.createFolder(SYS_ID, 'Checkout', null)

    expect(folder.id).toBeTruthy()
    expect(folder.name).toBe('Checkout')
    expect(folder.systemId).toBe(SYS_ID)
    expect(folder.parentId).toBeNull()
  })

  it('persists the folder to folders.json', async () => {
    const folder = await api.createFolder(SYS_ID, 'Checkout', null)

    const filePath = StoragePaths.templateFolders(tmpDir, SYS_ID)
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw) as TemplateFolder[]

    expect(persisted).toHaveLength(1)
    expect(persisted[0].id).toBe(folder.id)
  })

  it('creates a child folder with a parentId', async () => {
    const parent = await api.createFolder(SYS_ID, 'Parent', null)
    const child = await api.createFolder(SYS_ID, 'Child', parent.id)

    expect(child.parentId).toBe(parent.id)

    const filePath = StoragePaths.templateFolders(tmpDir, SYS_ID)
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf-8')) as TemplateFolder[]
    expect(persisted).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Folder — update
// ---------------------------------------------------------------------------

describe('TemplatesApi — updateFolder', () => {
  it('renames a folder', async () => {
    const folder = await api.createFolder(SYS_ID, 'OldName', null)

    const updated = await api.updateFolder(SYS_ID, folder.id, 'NewName')

    expect(updated.id).toBe(folder.id)
    expect(updated.name).toBe('NewName')
  })

  it('persists the renamed folder to disk', async () => {
    const folder = await api.createFolder(SYS_ID, 'OldName', null)

    await api.updateFolder(SYS_ID, folder.id, 'NewName')

    const filePath = StoragePaths.templateFolders(tmpDir, SYS_ID)
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf-8')) as TemplateFolder[]
    expect(persisted[0].name).toBe('NewName')
  })

  it('throws when the folder does not exist', async () => {
    await expect(api.updateFolder(SYS_ID, 'non-existent', 'X')).rejects.toThrow(
      'Template folder not found: non-existent'
    )
  })
})

// ---------------------------------------------------------------------------
// Folder — delete (simple and cascade)
// ---------------------------------------------------------------------------

describe('TemplatesApi — deleteFolder', () => {
  it('removes a folder from folders.json', async () => {
    const folder = await api.createFolder(SYS_ID, 'ToDelete', null)

    await api.deleteFolder(SYS_ID, folder.id)

    const filePath = StoragePaths.templateFolders(tmpDir, SYS_ID)
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf-8')) as TemplateFolder[]
    expect(persisted.find((f) => f.id === folder.id)).toBeUndefined()
  })

  it('also deletes templates inside the folder', async () => {
    const schema = await seedSchema('schema-1')
    const folder = await api.createFolder(SYS_ID, 'Parent', null)
    const tmpl = await api.create(makeInput(schema.id, { folderId: folder.id }))

    await api.deleteFolder(SYS_ID, folder.id)

    await expect(api.get(SYS_ID, tmpl.id)).rejects.toThrow('Template not found')
  })

  it('recursively deletes child folders and their templates', async () => {
    const schema = await seedSchema('schema-1')
    const parent = await api.createFolder(SYS_ID, 'Parent', null)
    const child = await api.createFolder(SYS_ID, 'Child', parent.id)
    const tmplInChild = await api.create(makeInput(schema.id, { folderId: child.id }))

    await api.deleteFolder(SYS_ID, parent.id)

    // Both folders should be gone
    const filePath = StoragePaths.templateFolders(tmpDir, SYS_ID)
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf-8')) as TemplateFolder[]
    expect(persisted).toHaveLength(0)

    // Template in child folder should be deleted
    await expect(api.get(SYS_ID, tmplInChild.id)).rejects.toThrow('Template not found')
  })

  it('does not delete templates in sibling folders', async () => {
    const schema = await seedSchema('schema-1')
    const folderA = await api.createFolder(SYS_ID, 'FolderA', null)
    const folderB = await api.createFolder(SYS_ID, 'FolderB', null)
    const tmplInB = await api.create(makeInput(schema.id, { folderId: folderB.id }))

    await api.deleteFolder(SYS_ID, folderA.id)

    const result = await api.get(SYS_ID, tmplInB.id)
    expect(result.id).toBe(tmplInB.id)
  })
})

// ---------------------------------------------------------------------------
// Template — create
// ---------------------------------------------------------------------------

describe('TemplatesApi — create', () => {
  it('returns a template with generated id and timestamps', async () => {
    const schema = await seedSchema('schema-1')
    const before = new Date().toISOString()
    const tmpl = await api.create(makeInput(schema.id))
    const after = new Date().toISOString()

    expect(tmpl.id).toBeTruthy()
    expect(tmpl.systemId).toBe(SYS_ID)
    expect(tmpl.createdAt >= before).toBe(true)
    expect(tmpl.createdAt <= after).toBe(true)
    expect(tmpl.createdAt).toBe(tmpl.updatedAt)
  })

  it('persists the template to disk', async () => {
    const schema = await seedSchema('schema-1')
    const tmpl = await api.create(makeInput(schema.id))

    const filePath = StoragePaths.template(tmpDir, SYS_ID, tmpl.id)
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw) as Template

    expect(persisted.id).toBe(tmpl.id)
    expect(persisted.name).toBe('My Template')
  })

  it('stores optional description when provided', async () => {
    const schema = await seedSchema('schema-1')
    const tmpl = await api.create(makeInput(schema.id, { description: 'A test template' }))

    expect(tmpl.description).toBe('A test template')
  })

  it('throws when the referenced schema does not exist', async () => {
    await expect(api.create(makeInput('nonexistent-schema'))).rejects.toThrow(
      'Schema not found: nonexistent-schema'
    )
  })

  it('throws when a required field is missing from fields', async () => {
    const schema = await seedSchema('schema-1', [requiredElement])

    await expect(
      api.create(makeInput(schema.id, { fields: [] }))
    ).rejects.toThrow('Required field "orderId" must be set or marked as omitted')
  })

  it('accepts a required field marked as omitted (value is irrelevant when omitted)', async () => {
    const schema = await seedSchema('schema-1', [requiredElement])

    // When action is 'omit', the field is intentionally excluded
    const tmpl = await api.create(
      makeInput(schema.id, {
        fields: [{ elementPath: 'orderId', action: 'omit' }]
      })
    )

    expect(tmpl.id).toBeTruthy()
  })

  it('validates nested required fields with dot-notation paths', async () => {
    const schema = await seedSchema('schema-nested', [
      {
        name: 'address',
        required: false,
        dataType: { type: 'object' },
        generationStrategy: { type: 'random', config: {} },
        children: [
          {
            name: 'zip',
            required: true,
            dataType: { type: 'string' },
            generationStrategy: { type: 'pattern', config: { pattern: '\\d{5}' } }
          }
        ]
      }
    ])

    await expect(
      api.create(makeInput(schema.id, { fields: [] }))
    ).rejects.toThrow('Required field "address.zip" must be set or marked as omitted')
  })

  it('succeeds when all required fields are set', async () => {
    const schema = await seedSchema('schema-multi', [requiredElement, optionalElement])
    const tmpl = await api.create(
      makeInput(schema.id, {
        fields: [{ elementPath: 'orderId', action: 'set', value: 'order-abc' }]
      })
    )

    expect(tmpl.fields).toHaveLength(1)
    expect(tmpl.fields[0].elementPath).toBe('orderId')
  })
})

// ---------------------------------------------------------------------------
// Template — get
// ---------------------------------------------------------------------------

describe('TemplatesApi — get', () => {
  it('returns the template by id', async () => {
    const schema = await seedSchema('schema-1')
    const created = await api.create(makeInput(schema.id))

    const result = await api.get(SYS_ID, created.id)

    expect(result).toEqual(created)
  })

  it('throws when the template does not exist', async () => {
    await expect(api.get(SYS_ID, 'nonexistent')).rejects.toThrow('Template not found: nonexistent')
  })
})

// ---------------------------------------------------------------------------
// Template — list (tree building)
// ---------------------------------------------------------------------------

describe('TemplatesApi — list (tree building)', () => {
  it('returns an empty tree when nothing exists', async () => {
    const tree = await api.list(SYS_ID)

    expect(tree.folders).toHaveLength(0)
    expect(tree.templates).toHaveLength(0)
  })

  it('places root-level templates in tree.templates', async () => {
    const schema = await seedSchema('schema-1')
    const tmpl = await api.create(makeInput(schema.id, { folderId: null }))

    const tree = await api.list(SYS_ID)

    expect(tree.templates).toHaveLength(1)
    expect(tree.templates[0].id).toBe(tmpl.id)
    expect(tree.folders).toHaveLength(0)
  })

  it('places root folders in tree.folders', async () => {
    const folder = await api.createFolder(SYS_ID, 'Root', null)

    const tree = await api.list(SYS_ID)

    expect(tree.folders).toHaveLength(1)
    expect(tree.folders[0].folder.id).toBe(folder.id)
  })

  it('nests child folders under their parent node', async () => {
    const parent = await api.createFolder(SYS_ID, 'Parent', null)
    await api.createFolder(SYS_ID, 'Child', parent.id)

    const tree = await api.list(SYS_ID)

    expect(tree.folders).toHaveLength(1)
    const parentNode = tree.folders[0]
    expect(parentNode.children).toHaveLength(1)
    expect(parentNode.children[0].folder.name).toBe('Child')
  })

  it('attaches templates to the correct folder node', async () => {
    const schema = await seedSchema('schema-1')
    const folder = await api.createFolder(SYS_ID, 'Orders', null)
    const tmpl = await api.create(makeInput(schema.id, { folderId: folder.id }))

    const tree = await api.list(SYS_ID)

    expect(tree.templates).toHaveLength(0)
    expect(tree.folders[0].templates).toHaveLength(1)
    expect(tree.folders[0].templates[0].id).toBe(tmpl.id)
  })

  it('builds a multi-level tree correctly', async () => {
    const schema = await seedSchema('schema-1')
    const root = await api.createFolder(SYS_ID, 'Root', null)
    const sub = await api.createFolder(SYS_ID, 'Sub', root.id)
    const rootTmpl = await api.create(makeInput(schema.id, { name: 'RootTmpl', folderId: root.id }))
    const subTmpl = await api.create(makeInput(schema.id, { name: 'SubTmpl', folderId: sub.id }))
    const orphan = await api.create(makeInput(schema.id, { name: 'Orphan', folderId: null }))

    const tree = await api.list(SYS_ID)

    expect(tree.templates).toHaveLength(1)
    expect(tree.templates[0].id).toBe(orphan.id)

    const rootNode = tree.folders[0]
    expect(rootNode.folder.id).toBe(root.id)
    expect(rootNode.templates).toHaveLength(1)
    expect(rootNode.templates[0].id).toBe(rootTmpl.id)

    const subNode = rootNode.children[0]
    expect(subNode.folder.id).toBe(sub.id)
    expect(subNode.templates).toHaveLength(1)
    expect(subNode.templates[0].id).toBe(subTmpl.id)
  })
})

// ---------------------------------------------------------------------------
// Template — update
// ---------------------------------------------------------------------------

describe('TemplatesApi — update', () => {
  it('updates the name', async () => {
    const schema = await seedSchema('schema-1')
    const tmpl = await api.create(makeInput(schema.id))

    const updated = await api.update(SYS_ID, tmpl.id, { name: 'Renamed' })

    expect(updated.name).toBe('Renamed')
    expect(updated.id).toBe(tmpl.id)
  })

  it('updates updatedAt but not createdAt', async () => {
    const schema = await seedSchema('schema-1')
    const tmpl = await api.create(makeInput(schema.id))

    await new Promise((r) => setTimeout(r, 5))
    const updated = await api.update(SYS_ID, tmpl.id, { name: 'Changed' })

    expect(updated.createdAt).toBe(tmpl.createdAt)
    expect(updated.updatedAt >= tmpl.updatedAt).toBe(true)
  })

  it('persists the update to disk', async () => {
    const schema = await seedSchema('schema-1')
    const tmpl = await api.create(makeInput(schema.id))

    await api.update(SYS_ID, tmpl.id, { name: 'Persisted' })

    const fromDisk = await api.get(SYS_ID, tmpl.id)
    expect(fromDisk.name).toBe('Persisted')
  })

  it('preserves fields not included in the update', async () => {
    const schema = await seedSchema('schema-1')
    const tmpl = await api.create(makeInput(schema.id, { description: 'Original desc' }))

    const updated = await api.update(SYS_ID, tmpl.id, { name: 'Renamed' })

    expect(updated.description).toBe('Original desc')
    expect(updated.schemaId).toBe(tmpl.schemaId)
  })

  it('throws when the template does not exist', async () => {
    await expect(api.update(SYS_ID, 'missing', { name: 'X' })).rejects.toThrow(
      'Template not found: missing'
    )
  })
})

// ---------------------------------------------------------------------------
// Template — delete
// ---------------------------------------------------------------------------

describe('TemplatesApi — delete', () => {
  it('removes the template file from disk', async () => {
    const schema = await seedSchema('schema-1')
    const tmpl = await api.create(makeInput(schema.id))
    const filePath = StoragePaths.template(tmpDir, SYS_ID, tmpl.id)

    await api.delete(SYS_ID, tmpl.id)

    await expect(fs.access(filePath)).rejects.toThrow()
  })

  it('template is no longer returned by list after deletion', async () => {
    const schema = await seedSchema('schema-1')
    const tmpl = await api.create(makeInput(schema.id))

    await api.delete(SYS_ID, tmpl.id)

    const tree = await api.list(SYS_ID)
    const allTemplates = [
      ...tree.templates,
      ...tree.folders.flatMap((n) => n.templates)
    ]
    expect(allTemplates.find((t) => t.id === tmpl.id)).toBeUndefined()
  })

  it('does not throw when deleting a non-existent template', async () => {
    await expect(api.delete(SYS_ID, 'nonexistent')).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Template — move
// ---------------------------------------------------------------------------

describe('TemplatesApi — move', () => {
  it('moves a template to a new folder', async () => {
    const schema = await seedSchema('schema-1')
    const folder = await api.createFolder(SYS_ID, 'Target', null)
    const tmpl = await api.create(makeInput(schema.id, { folderId: null }))

    const moved = await api.move(SYS_ID, tmpl.id, folder.id)

    expect(moved.folderId).toBe(folder.id)
    expect(moved.id).toBe(tmpl.id)
  })

  it('moves a template to the root (null folderId)', async () => {
    const schema = await seedSchema('schema-1')
    const folder = await api.createFolder(SYS_ID, 'Source', null)
    const tmpl = await api.create(makeInput(schema.id, { folderId: folder.id }))

    const moved = await api.move(SYS_ID, tmpl.id, null)

    expect(moved.folderId).toBeNull()
  })

  it('persists the new folderId to disk', async () => {
    const schema = await seedSchema('schema-1')
    const folder = await api.createFolder(SYS_ID, 'Target', null)
    const tmpl = await api.create(makeInput(schema.id, { folderId: null }))

    await api.move(SYS_ID, tmpl.id, folder.id)

    const fromDisk = await api.get(SYS_ID, tmpl.id)
    expect(fromDisk.folderId).toBe(folder.id)
  })

  it('updates updatedAt on move', async () => {
    const schema = await seedSchema('schema-1')
    const folder = await api.createFolder(SYS_ID, 'Target', null)
    const tmpl = await api.create(makeInput(schema.id))

    await new Promise((r) => setTimeout(r, 5))
    const moved = await api.move(SYS_ID, tmpl.id, folder.id)

    expect(moved.updatedAt >= tmpl.updatedAt).toBe(true)
  })

  it('reflects the move in the tree returned by list', async () => {
    const schema = await seedSchema('schema-1')
    const folder = await api.createFolder(SYS_ID, 'Target', null)
    const tmpl = await api.create(makeInput(schema.id, { folderId: null }))

    await api.move(SYS_ID, tmpl.id, folder.id)

    const tree = await api.list(SYS_ID)
    expect(tree.templates).toHaveLength(0)
    expect(tree.folders[0].templates).toHaveLength(1)
    expect(tree.folders[0].templates[0].id).toBe(tmpl.id)
  })

  it('throws when the template does not exist', async () => {
    await expect(api.move(SYS_ID, 'nonexistent', null)).rejects.toThrow(
      'Template not found: nonexistent'
    )
  })
})
