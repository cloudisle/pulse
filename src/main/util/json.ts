/**
 * Evaluates a simple JSONPath expression (dot-notation, array index) on an object.
 * Supports expressions like: `$`, `$.foo`, `$.foo.bar`, `$.arr[0]`, `$.foo.arr[1].baz`
 */
export function evaluateJsonPath(obj: unknown, path: string): unknown {
    if (!path.startsWith('$')) return undefined
    const inner = path.slice(1)
    if (inner === '' || inner === '.') return obj

    const normalized = inner.startsWith('.') ? inner.slice(1) : inner
    if (!normalized) return obj

    const segment = /([^.[]+)|\[(\d+)\]/g
    let match: RegExpExecArray | null
    const parts: (string | number)[] = []

    while ((match = segment.exec(normalized)) !== null) {
        if (match[1] !== undefined) parts.push(match[1])
        else if (match[2] !== undefined) parts.push(parseInt(match[2], 10))
    }

    let current: unknown = obj
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined
        current = (current as Record<string | number, unknown>)[part]
    }
    return current
}