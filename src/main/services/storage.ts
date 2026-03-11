import { promises as fs } from 'fs'
import path from 'path'

export class StorageService {
  async read<T>(filePath: string): Promise<T | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content) as T
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw err
    }
  }

  async write<T>(filePath: string, data: T): Promise<void> {
    await this.ensureDir(path.dirname(filePath))
    const tmpPath = `${filePath}.tmp`
    try {
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
      await fs.rename(tmpPath, filePath)
    } catch (err) {
      await this.delete(tmpPath)
      throw err
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err
      }
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async listDir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath)
  }

  async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }
}

export class StoragePaths {
  static settings(dataDir: string): string {
    return path.join(dataDir, 'settings.json')
  }

  static system(dataDir: string, systemId: string): string {
    return path.join(dataDir, 'systems', systemId, 'system.json')
  }

  static schema(dataDir: string, systemId: string, schemaId: string): string {
    return path.join(dataDir, 'systems', systemId, 'schemas', `${schemaId}.json`)
  }

  static environment(dataDir: string, systemId: string, environmentId: string): string {
    return path.join(dataDir, 'systems', systemId, 'environments', `${environmentId}.json`)
  }

  static profile(dataDir: string, systemId: string, profileId: string): string {
    return path.join(dataDir, 'systems', systemId, 'profiles', `${profileId}.json`)
  }

  static customType(dataDir: string, systemId: string, typeId: string): string {
    return path.join(dataDir, 'systems', systemId, 'custom-types', `${typeId}.json`)
  }

  static template(dataDir: string, systemId: string, templateId: string): string {
    return path.join(dataDir, 'systems', systemId, 'templates', `${templateId}.json`)
  }

  static templateFolders(dataDir: string, systemId: string): string {
    return path.join(dataDir, 'systems', systemId, 'templates', 'folders.json')
  }

  static session(dataDir: string, systemId: string, sessionId: string): string {
    return path.join(dataDir, 'systems', systemId, 'sessions', sessionId, 'session.json')
  }

  static sessionEvent(
    dataDir: string,
    systemId: string,
    sessionId: string,
    eventId: string
  ): string {
    return path.join(
      dataDir,
      'systems',
      systemId,
      'sessions',
      sessionId,
      'events',
      `${eventId}.json`
    )
  }

  static sessionLogs(dataDir: string, systemId: string, sessionId: string): string {
    return path.join(dataDir, 'systems', systemId, 'sessions', sessionId, 'logs.json')
  }
}
