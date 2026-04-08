import { OpenApiImportService } from '@main/services/openapi-import.service'
import type { OpenApiImportResult } from '@shared/models/openapi'

export class OpenApiImportApi {
  private readonly service = new OpenApiImportService()

  async parseFile(content: string): Promise<OpenApiImportResult> {
    return this.service.parse(content)
  }
}
