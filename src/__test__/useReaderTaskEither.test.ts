import * as RD from "@devexperts/remote-data-ts/lib"
import { act, renderHook } from "@testing-library/react-hooks"
import { taskEither } from "fp-ts"
import { eq, eqString } from "fp-ts/lib/Eq"
import { getUseRTAHook } from "../react"

describe("getUseRTAHook", () => {
  it("returns returns the correct values and caches correctly when invalidation is false", async () => {
    const inputEq = eq.contramap(eqString, (s: { bar: string }) => s.bar)

    const rta = jest.fn((_: { bar: string }) => {
      return taskEither.right({ foo: 1 })
    })
    const hook = getUseRTAHook(rta, { inputEq, shouldRefetch: () => false })

    const { result, waitFor } = renderHook(() => hook({ bar: "foo" }))

    await waitFor(() => result.current[0]._tag === "RemoteSuccess")

    const { result: result2 } = renderHook(() => hook({ bar: "foo" }))

    expect(result.all.map((v: any) => v[0])).toEqual([RD.initial, RD.pending, RD.success({ foo: 1 })])
    expect(result2.all.map((v: any) => v[0])).toEqual([RD.success({ foo: 1 })])
    expect(rta).toHaveBeenCalledTimes(1)
  })

  it("returns returns the correct values and caches correctly when invalidation is true", async () => {
    const inputEq = eq.contramap(eqString, (s: { bar: string }) => s.bar)

    let firstPaint = true

    const rta = jest.fn((_: { bar: string }) => {
      if (firstPaint === true) {
        firstPaint = false
        return taskEither.right({ foo: 1 })
      }
      return taskEither.right({ foo: 2 })
    })
    const hook = getUseRTAHook(rta, { inputEq, shouldRefetch: () => true })

    const { result, waitFor } = renderHook(() => hook({ bar: "foo" }))

    await waitFor(() => result.current[0]._tag === "RemoteSuccess")

    const { result: result2 } = renderHook(() => hook({ bar: "foo" }))

    await waitFor(() => result2.current[0]._tag === "RemoteSuccess")

    expect(result.all.map((v: any) => v[0])).toEqual([
      RD.initial,
      RD.pending,
      RD.success({ foo: 1 }),
      RD.pending,
      RD.success({ foo: 2 }),
    ])
    expect(result2.all.map((v: any) => v[0])).toEqual([RD.initial, RD.pending, RD.success({ foo: 2 })])
    expect(rta).toHaveBeenCalledTimes(2)
  })

  it("returns returns the correct values and caches correctly when invalidation is called manually", async () => {
    const inputEq = eq.contramap(eqString, (s: { bar: string }) => s.bar)

    const rta = jest.fn((_: { bar: string }) => {
      return taskEither.right({ foo: 1 })
    })
    const hook = getUseRTAHook(rta, { inputEq, shouldRefetch: () => false })

    const { result, waitFor } = renderHook(() => hook({ bar: "foo" }))

    await waitFor(() => result.current[0]._tag === "RemoteSuccess")

    //invalidate
    act(() => result.current[1]({ bar: "foo" }))

    await waitFor(() => result.current[0]._tag === "RemoteSuccess")

    expect(result.all.map((v: any) => v[0])).toEqual([
      RD.initial,
      RD.pending,
      RD.success({ foo: 1 }),
      RD.initial,
      RD.pending,
      RD.success({ foo: 1 }),
    ])
    expect(rta).toHaveBeenCalledTimes(2)
  })
})
