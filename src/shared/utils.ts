import { ST_DELIM } from "./constants";

export function ensureArray<T>(v: T | T[] | undefined): T[] {
  return Array.isArray(v) ? v : !v ? [] : [v]
}

type Entries<T> = (keyof T extends infer U ? (U extends keyof T ? [U, T[U]] : never) : never)[]
export function getObjEntries<T extends Record<string, unknown>>(obj: T): Entries<T> {
  return Object.entries(obj) as Entries<T>
}

export function randomString(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const chLen = chars.length
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (x) => chars[x % chLen]).join('')
}

export function assertOrWarn<T>(validCondition: T, msg: string): validCondition is NonNullable<T> {
  return validCondition ? true : (console.warn(msg), false)
}

export function assertOrThrow<T>(validCondition: T, msg: string): validCondition is NonNullable<T> {
  if (!validCondition) {
    throw new Error(msg)
  }
  return true
}

export function joinStateToPath(pPath: string, stateName: string) {
  return `${pPath}${ST_DELIM}${stateName}`
}
export function getTransitionFullPath(transitionTarget: string, crrStatePath: string, pPath: string) {
  return transitionTarget[0] === ST_DELIM ? transitionTarget : transitionTarget.startsWith('./') ? joinStateToPath(crrStatePath, transitionTarget.slice(2)) : joinStateToPath(pPath, transitionTarget)
}

function getCircularReplacer() {
  const seen = new WeakSet()
  return (key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return
      seen.add(value)
    }
    return value
  }
}

export function stringifyCircular(target: any) {
  const seen = new WeakSet()
  return JSON.stringify(target, (_, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return
      seen.add(value)
    }
    return value
  })
}

export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) {
    return obj
  }
  try {
    if (Array.isArray(obj)) {
      obj.forEach((el) => deepFreeze(el))
    } else {
      Object.keys(obj).forEach((key) => {
        const prop = (obj as { [key: string]: unknown })[key]
        if (!Object.isFrozen(prop)) {
          deepFreeze(prop)
        }
      })
    }
    return Object.freeze(obj) as Readonly<T>
  } catch (error) {
    console.error("Error occurred in deepFreeze:", error)
    return obj;
  }
}
