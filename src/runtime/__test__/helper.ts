import type { StateRoute } from '../r.types'

// biome-ignore lint/complexity/noBannedTypes: x
type StatePreRoute = Array<string | String | { parallel: string; regions: { [key: string]: StatePreRoute } }>
export function objectifyRouteString(ary: StatePreRoute): StateRoute {
  return ary.map((el) => {
    if (typeof el === 'string') {
      return Object(el)
    } else if (el instanceof String) {
      return el
    }
    return {
      ...el,
      regions: Object.entries(el.regions).reduce(
        (acc, [k, v]) => {
          acc[k] = objectifyRouteString(v)
          return acc
        },
        {} as Record<string, StateRoute>,
      ),
    }
  })
}

