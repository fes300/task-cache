import { Eq } from "fp-ts/Eq"
import { pipe } from "fp-ts/function"
import * as RTA from "fp-ts/ReaderTaskEither"
import * as RD from "@devexperts/remote-data-ts/lib"
import { BehaviorSubject } from "rxjs"
import { option, readonlyArray, task, taskEither } from "fp-ts"

const Cache = new Map()

export interface CacheValue<E, A> {
  value: RD.RemoteData<E, A>
  timestamp: number
}

export const getCacheResults = <R, E, A>(
  rta: RTA.ReaderTaskEither<R, E, A>,
): Map<R, BehaviorSubject<CacheValue<E, A>>> => {
  if (!Cache.get(rta)) {
    Cache.set(rta, new Map())
  }
  return Cache.get(rta)
}

export const getCacheValue = <R, E, A>(
  rta: RTA.ReaderTaskEither<R, E, A>,
  i: R,
  inputEq: Eq<R>,
): BehaviorSubject<{ value: RD.RemoteData<E, A>; timestamp: number }> => {
  const cachedResults = getCacheResults(rta)
  const entries = Array.from(cachedResults.entries())
  const result = pipe(
    entries,
    readonlyArray.findFirstMap(([k, v]) => {
      return pipe(
        v,
        option.fromPredicate(() => inputEq.equals(i, k)),
      )
    }),
    option.getOrElse(() => {
      cachedResults.set(i, new BehaviorSubject({ value: RD.initial as RD.RemoteData<E, A>, timestamp: Date.now() }))

      return cachedResults.get(i) as BehaviorSubject<CacheValue<E, A>>
    }),
  )

  return result
}

export const setCacheValue = <R, E, A>(
  rta: RTA.ReaderTaskEither<R, E, A>,
  i: R,
  inputEq: Eq<R>,
  a: RD.RemoteData<E, A>,
): void => {
  const bs = getCacheValue(rta, i, inputEq)

  bs.next({ value: a, timestamp: Date.now() })
}

export type CacheStrategy<R, E, A> = {
  inputEq: Eq<R>
  shouldRefetch: (lastResult: CacheValue<E, A>) => boolean
}

export function cached<R, E, A>(
  rta: RTA.ReaderTaskEither<R, E, A>,
  cacheStrategy: CacheStrategy<R, E, A>,
): [ta: RTA.ReaderTaskEither<R, E, A>, invalidate: (i: R) => void] {
  const cachedRTA = (i: R) => {
    const cachedResult = getCacheValue(rta, i, cacheStrategy.inputEq)

    const refetch = pipe(cachedResult.getValue(), cacheStrategy.shouldRefetch)

    const invalidDataMessage = "Data invalidated by strategy" as E | string

    const toEither = (r: RD.RemoteData<E, A>) =>
      pipe(
        r,
        RD.toEither(
          () => invalidDataMessage,
          () => invalidDataMessage,
        ),
      )

    return refetch ? taskEither.left(invalidDataMessage) : task.of(toEither(cachedResult.getValue().value))
  }

  const notCachedRTA = (i: R) =>
    pipe(
      rta(i),
      taskEither.bimap(
        (e) => {
          setCacheValue(rta, i, cacheStrategy.inputEq, RD.failure(e))
          return e
        },
        (v) => {
          setCacheValue(rta, i, cacheStrategy.inputEq, RD.success(v))
          return v
        },
      ),
    )

  const finalRTA = pipe(
    cachedRTA,
    RTA.altW(() => notCachedRTA),
  ) as RTA.ReaderTaskEither<R, E, A>

  return [
    finalRTA,
    (i: R) => {
      setCacheValue(rta, i, cacheStrategy.inputEq, RD.initial)
    },
  ]
}
