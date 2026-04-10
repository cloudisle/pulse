import type { SchemaElement } from '@shared/models/schema'

export interface OpenApiParsedSchema {
    name: string
    description?: string
    elements: SchemaElement[]
}

export interface OpenApiImportResult {
    schemas: OpenApiParsedSchema[]
    error?: string
}