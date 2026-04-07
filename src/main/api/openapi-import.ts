import { OpenApiImportService } from '../services/openapi-import.service'
import type { OpenApiImportResult } from '../services/openapi-import.service'

export class OpenApiImportApi {
  private readonly service = new OpenApiImportService()

  async parseFile(content: string): Promise<OpenApiImportResult> {
    return this.service.parse(content)
  }
}
