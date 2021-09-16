![release](https://github.com/fes300/task-cache/actions/workflows/release.yml/badge.svg)

# task-cache

a very small library to implement a cache layer over a function implementing [`ReaderTaskEither`](https://github.com/gcanti/fp-ts/blob/master/docs/modules/ReaderTaskEither.ts.md) signature. Heavily inspired by [Avenger](https://github.com/buildo/avenger).

## install

### yarn

```shell
yarn add task-cache
```

### npm

```shell
npm install -S task-cache
```

## quick start

Create a function with the readerTaskEither signature, wrap it with `getUseRTAHook` and use the resulting hook in your components:

```tsx
import { getUseRTAHook } from "task-cache/react"
import { right } from "fp-ts/Either"

type Input = { token: string }
const getUser = (i: Input) => () => Promise.resolve(right({ name: "Mario" }))
const userHook = getUseRTAHook(getUser, { shouldRefetch: () => false })

const Username: React.FC = () => {
  const [user, invalidate] = userHook({ token: "123abc" })

  return user._tag === "success" ? (
    <>
      <div>`Hi ${user.value.name}!`</div>
      <button onClick={() => invalidate({ token: "123abc" })}>Logout</button>
    </>
  ) : (
    <div>Loading...</div>
  )
}
```

> Using the react utility `getUseRTAHook` you get back a [`RemoteData<E, A>`]("https://github.com/devexperts/remote-data-ts"), while using the lower lavel api `cached` you get back a function with the same signature as the original one.

## CacheStrategy

Out of the box `task-cache` provides you a very simple "cache-first" strategy where JSON stringification is used to determine input equality (important to determine where to store cached values) and cached value is always used (if found):

```tsx
import { string } from "fp-ts"
import { pipe } from "fp-ts/function"
import { contramap } from "fp-ts/Eq"

const eqJson = pipe(
  string.Eq,
  contramap((v) => JSON.stringify(v)),
)
const defaultCacheStrategy = {
  inputEq: eqJson,
  shouldRefetch: () => false,
}
```

if you have different needs you can provide your own implementation of `CacheStrategy`, for example you may want to invalidate the cache every X minutes:

```tsx
import { getUseRTAHook } from "task-cache/react"
import { either, option } from "fp-ts"

type Input = { token: string }
const getUser = (i: Input) => () => Promise.resolve(either.right({ name: "Mario" }))
const userHook = getUseRTAHook(getUser, {
  shouldRefetch: (lastValue) =>
    pipe(
      lastValue,
      option.fold(
        () => true,
        (v) => Date.now() - v.timestamp > 5000,
      ),
    ),
})
```

or you may need a custom inputEquality. In the following example two cached functions are joined toghether by sequencing, in this situation the resulting ReaderTaskEither will have both inputs (`zum` and `bar`) in its signature and would invalidate both `rta` and `rta2` with the default strategy, therefore we use custom ones:

```tsx
import { string } from "fp-ts"
import { pipe } from "fp-ts/function"
import { contramap } from "fp-ts/Eq"
import { cached } from "task-cache"
import { sequenceS } from "fp-ts/lib/Apply"

const inputEq = pipe(
  string.Eq,
  contramap((s: { bar: string }) => s.bar),
)
const inputEq2 = pipe(
  string.Eq,
  contramap((s: { zum: string }) => s.zum),
)

const rta = (_: { bar: string }) => {
  return taskEither.right({ foo: 1 })
}
const rta2 = (_: { zum: string; bar: string }) => {
  return taskEither.right({ bar: [1] })
}

const [cachedRTA] = cached(rta, { inputEq })
const [cachedRTA2] = cached(rta2, { inputEq: inputEq2 })

const product = sequenceS(readerTaskEither.readerTaskEither)({ cachedRTA, cachedRTA2 })

const result = product({ bar: "baz", zum: "foo" })()
```

## cached

hooks are not the only utility exposed by the library, if you are not using react you can use the lower level `cached` to create you own implementation:

```tsx
import { cached } from "task-cache"

const getFoo = (_: { bar: string }) => {
  return taskEither.right({ foo: 1 })
}

const [cachedRTA, invalidate] = cached(getFoo)

const result = await product({ bar: "baz" })()
const result2 = await product({ bar: "baz" })() // getFoo is not called, instead the cached value is returned
invalidate({ bar: "baz" })
const result2 = await product({ bar: "baz" })() // getFoo is called because the cached value for input { bar: "baz" } was invalidated
```

## release flow

[here](https://github.com/semantic-release/semantic-release/blob/1405b94296059c0c6878fb8b626e2c5da9317632/docs/recipes/pre-releases.md) you can find an explanation of the release flow.
