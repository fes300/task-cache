import { either, readerTaskEither, taskEither } from "fp-ts"
import { eq, eqString } from "fp-ts/Eq"
import { sequenceS } from "fp-ts/Apply"
import { pipe } from "fp-ts/function"
import { cached } from "../index"

describe("cached", () => {
  it("returns a value when REA succeds", async () => {
    const inputEq = eq.contramap(eqString, (s) => JSON.stringify(s))

    const rta = (_: { bar: string }) => taskEither.of({ foo: 123 })
    const [cachedRTA] = cached(rta, { inputEq, shouldRefetch: () => true })

    const result = await cachedRTA({ bar: "baz" })()

    expect(result).toEqual(either.right({ foo: 123 }))
  })

  it("returns a error when REA fails", async () => {
    const inputEq = eq.contramap(eqString, (s) => JSON.stringify(s))

    const rta = (_: { bar: string }) => taskEither.left({ error: true })
    const [cachedRTA] = cached(rta, { inputEq, shouldRefetch: () => true })

    const result = await cachedRTA({ bar: "baz" })()

    expect(result).toEqual(either.left({ error: true }))
  })

  it("returns a value when REA fails then succeeds", async () => {
    const inputEq = eq.contramap(eqString, (s) => JSON.stringify(s))

    let firstCall = true

    const rta = (_: { bar: string }) => {
      const ta = firstCall ? taskEither.left({ error: true }) : taskEither.right({ foo: "baz" })
      firstCall = false
      return ta
    }

    const [cachedRTA] = cached(rta, { inputEq, shouldRefetch: () => false })

    const result = await cachedRTA({ bar: "baz" })()

    expect(result).toEqual(either.left({ error: true }))

    const result2 = await cachedRTA({ bar: "baz" })()

    expect(result2).toEqual(either.right({ foo: "baz" }))
  })

  it("returns a cached value when REA is called twice", async () => {
    const inputEq = eq.contramap(eqString, (s: { bar: string }) => JSON.stringify(s))

    const rta = jest.fn((_: { bar: string }) => {
      return taskEither.right({ foo: "baz" })
    })

    const [cachedRTA] = cached(rta, { inputEq, shouldRefetch: () => false })

    await cachedRTA({ bar: "baz" })()
    await cachedRTA({ bar: "baz" })()
    await cachedRTA({ bar: "baz" })()

    const result2 = await cachedRTA({ bar: "baz" })()

    expect(result2).toEqual(either.right({ foo: "baz" }))
    expect(rta).toHaveBeenCalledTimes(1)
  })

  it("returns a different value when REA is called twice with different inputs", async () => {
    const inputEq = eq.contramap(eqString, (s: { bar: string }) => JSON.stringify(s))

    const rta = jest.fn((i: { bar: string }) => {
      return taskEither.right({ foo: i.bar === "baz" ? 1 : 2 })
    })

    const [cachedRTA] = cached(rta, { inputEq, shouldRefetch: () => false })

    await cachedRTA({ bar: "baz" })()
    const result2 = await cachedRTA({ bar: "foo" })()

    expect(result2).toEqual(either.right({ foo: 2 }))
    expect(rta).toHaveBeenCalledTimes(2)
  })

  it("returns a non-cached value when REA is called twice with the same input but shouldFetch returns true", async () => {
    const inputEq = eq.contramap(eqString, (s: { bar: string }) => JSON.stringify(s))

    const rta = jest.fn((_: { bar: string }) => {
      return taskEither.right({ foo: "baz" })
    })

    const [cachedRTA] = cached(rta, { inputEq, shouldRefetch: () => true })

    await cachedRTA({ bar: "baz" })()
    await cachedRTA({ bar: "baz" })()
    await cachedRTA({ bar: "baz" })()

    const result2 = await cachedRTA({ bar: "baz" })()

    expect(result2).toEqual(either.right({ foo: "baz" }))
    expect(rta).toHaveBeenCalledTimes(4)
  })

  it("when a cached ta depends on another cached ta only the ones that must refresh do", async () => {
    const inputEq = eq.contramap(eqString, (s: { bar: string }) => s.bar)
    const inputEq2 = eq.contramap(eqString, (s: { bar: string; zum: string }) => JSON.stringify(s))

    const rta = jest.fn((_: { bar: string }) => {
      return taskEither.right({ foo: 1 })
    })
    const rta2 = jest.fn((_: { foo: number; zum: string }) => {
      return taskEither.right({ bar: [1] })
    })

    const [cachedRTA] = cached(rta, { inputEq, shouldRefetch: () => false })
    const [cachedRTA2] = cached(
      pipe(
        cachedRTA,
        readerTaskEither.chainW(({ foo }) => ({ zum }: { zum: string }) => rta2({ foo, zum })),
      ),
      { inputEq: inputEq2, shouldRefetch: () => false },
    )

    await cachedRTA2({ bar: "baz", zum: "foo" })()
    await cachedRTA2({ bar: "baz", zum: "foo" })()

    const result2 = await cachedRTA2({ bar: "baz", zum: "foo2" })()

    expect(result2).toEqual(either.right({ bar: [1] }))
    expect(rta).toHaveBeenCalledTimes(1)
    expect(rta2).toHaveBeenCalledTimes(2)
  })

  it("sequencing works fine", async () => {
    const inputEq = eq.contramap(eqString, (s: { bar: string }) => s.bar)
    const inputEq2 = eq.contramap(eqString, (s: { zum: string }) => s.zum)

    const rta = jest.fn((_: { bar: string }) => {
      return taskEither.right({ foo: 1 })
    })
    const rta2 = jest.fn((_: { zum: string; bar: string }) => {
      return taskEither.right({ bar: [1] })
    })

    const [cachedRTA] = cached(rta, { inputEq, shouldRefetch: () => false })
    const [cachedRTA2] = cached(rta2, { inputEq: inputEq2, shouldRefetch: () => false })

    const product = sequenceS(readerTaskEither.readerTaskEither)({ cachedRTA, cachedRTA2 })

    await product({ bar: "baz", zum: "foo" })()
    await product({ bar: "baz", zum: "foo" })()

    const result2 = await product({ bar: "baz", zum: "foo2" })()

    expect(result2).toEqual(either.right({ cachedRTA: { foo: 1 }, cachedRTA2: { bar: [1] } }))
    expect(rta).toHaveBeenCalledTimes(1)
    expect(rta2).toHaveBeenCalledTimes(2)
  })
})
