import * as React from "react"
import { readerTaskEither, string } from "fp-ts"
import * as RD from "@devexperts/remote-data-ts/lib"
import { cached, CacheStrategy, getCacheValue, setCacheValue } from ".."
import { pipe } from "fp-ts/function"
import { usePrevious } from "./usePrevious"
import { contramap } from "fp-ts/Eq"
import { skip } from "rxjs"

const eqJson = pipe(
  string.Eq,
  contramap((v) => JSON.stringify(v)),
)

const getDefaultStrategy = <R, E, A>(cs?: Partial<CacheStrategy<R, E, A>>): CacheStrategy<R, E, A> => ({
  inputEq: cs?.inputEq ?? eqJson,
  shouldRefetch: cs?.shouldRefetch ?? (() => false),
})

export const getUseRTAHook = <R, E, A>(
  rta: readerTaskEither.ReaderTaskEither<R, E, A>,
  cacheStrategy?: Partial<CacheStrategy<R, E, A>>,
): ((i: R) => [RD.RemoteData<E, A>, (i: R) => void]) => {
  const strategy = getDefaultStrategy(cacheStrategy)
  const [cachedRta, invalidate] = cached(rta, strategy)

  return (i: R) => {
    const [value, setValue] = React.useState<RD.RemoteData<E, A>>(
      pipe(getCacheValue(rta, i, strategy.inputEq).getValue(), (v) =>
        strategy.shouldRefetch(v) ? RD.initial : v.value,
      ),
    )

    const previousValue = usePrevious(value, RD.initial)

    React.useEffect(() => {
      const cacheValue = getCacheValue(rta, i, strategy.inputEq)
      // subscribe to cache updates
      const subs = pipe(cacheValue, (bs) => {
        return bs.pipe(skip(1)).subscribe((v) => {
          setValue(v.value)
        })
      })

      if (RD.isInitial(value) || strategy.shouldRefetch(cacheValue.getValue())) {
        setCacheValue(rta, i, strategy.inputEq, RD.pending)

        cachedRta(i)()
      }
      return () => subs.unsubscribe()
    }, [])

    React.useEffect(() => {
      if (value._tag === "RemoteInitial" && previousValue._tag !== "RemoteInitial") {
        setCacheValue(rta, i, strategy.inputEq, RD.pending)

        cachedRta(i)()
      }
    }, [value._tag])

    return [value, invalidate]
  }
}
