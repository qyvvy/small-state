import { ST_DELIM } from "./constants";

export function ensureArray<T>(v: T | T[] | undefined): T[] {
  return Array.isArray(v) ? v : !v ? [] : [v]
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


// == object 関係 ==

// NOTE: 元のオブジェクトそのものを freeze する。同一性 （===） は変わらない
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

type O_Entries<T> = (keyof T extends infer U ? (U extends keyof T ? [U, T[U]] : never) : never)[]
export function getObjEntries<T extends Record<string, unknown>>(obj: T): O_Entries<T> {
  return Object.entries(obj) as O_Entries<T>
}

// Object.defineProperty に typescript の型チェック(value の型)を追加: 主に writable 用途
export function defineFixedProperty<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  value: T[K],
  option?: Parameters<typeof Object.defineProperty>[2]
) {
  Object.defineProperty(obj, key, {
    value,
    ...option
  });
}


export function isPlainObject(obj: unknown): obj is object {
  if (obj === null || typeof obj !== "object") return false
  const proto = Object.getPrototypeOf(obj)
  return proto === Object.prototype || proto === null
}


// == state path 関係 ==

export function joinStNameToPath(pPath: string, stateName: string) {
  return `${pPath}${ST_DELIM}${stateName}`
}
export function getTransitionFullPath(transitionTarget: string, crrStatePath: string, pPath: string) {
  return transitionTarget[0] === ST_DELIM ? transitionTarget : transitionTarget.startsWith(`.${ST_DELIM}`) ? joinStNameToPath(crrStatePath, transitionTarget.slice(2)) : joinStNameToPath(pPath, transitionTarget)
}
export function parentPathOf(statePath: string) {
  return statePath.slice(0, statePath.lastIndexOf(ST_DELIM))
}
export function splitStPath(statePath: string) {
  if (statePath === '') return []
  if (statePath[0] !== '/') {
    throw new Error(`path must start with '/': "${statePath}"`)
  }
  return statePath.slice(1).split(ST_DELIM)
}
