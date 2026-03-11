const VARIABLE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g

export class VariableReplacementService {
  replaceVariables(input: string, variables: Record<string, string>): string {
    return input.replace(VARIABLE_PATTERN, (_match, key: string) => {
      return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : _match
    })
  }

  replaceVariablesInObject(obj: unknown, variables: Record<string, string>): unknown {
    const clone = JSON.parse(JSON.stringify(obj)) as unknown
    return this.replaceInValue(clone, variables)
  }

  findUnresolvedVariables(input: string, variables: Record<string, string>): string[] {
    const seen = new Set<string>()
    let match: RegExpExecArray | null
    const regex = new RegExp(VARIABLE_PATTERN.source, 'g')
    while ((match = regex.exec(input)) !== null) {
      const key = match[1]
      if (!Object.prototype.hasOwnProperty.call(variables, key)) {
        seen.add(key)
      }
    }
    return Array.from(seen)
  }

  private replaceInValue(value: unknown, variables: Record<string, string>): unknown {
    if (typeof value === 'string') {
      return this.replaceVariables(value, variables)
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.replaceInValue(item, variables))
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {}
      for (const key of Object.keys(value as Record<string, unknown>)) {
        result[key] = this.replaceInValue((value as Record<string, unknown>)[key], variables)
      }
      return result
    }
    return value
  }
}
