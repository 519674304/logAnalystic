declare module 'react' {
  export type ReactNode = any
  export type ChangeEvent<T = Element> = {
    target: T
  }
  export type MouseEvent<T = Element> = {
    clientX: number
    clientY: number
    preventDefault(): void
    currentTarget: T
  }
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T
  export function useState<T>(
    initialState: T | (() => T)
  ): [T, (value: T | ((prev: T) => T)) => void]
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  export const StrictMode: any
  const React: any
  export default React
}

declare module 'react-dom/client' {
  export function createRoot(container: Element | DocumentFragment): {
    render(children: any): void
    unmount(): void
  }
}

declare module 'react/jsx-runtime' {
  export const Fragment: any
  export function jsx(type: any, props: any, key?: any): any
  export function jsxs(type: any, props: any, key?: any): any
}

declare namespace JSX {
  interface ElementChildrenAttribute {
    children: {}
  }

  interface IntrinsicElements {
    [elemName: string]: any
  }
}
