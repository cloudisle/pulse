export * from './json'
export * from './log'

export function lazy(obj: object, prop: string, supplier: () => any): void {
    Object.defineProperty(obj, prop, {
        configurable: true,
        enumerable: true,
        get() {
            const value = supplier.call(this);
            Object.defineProperty(this, prop, {
                value,
                writable: true,
                configurable: true,
                enumerable: true,
            });
            return value;
        },
    });
}