import '@testing-library/jest-dom/extend-expect'

import * as React from "react"
import { render, waitFor } from '@testing-library/react';
import { either } from "fp-ts"
import { eq, eqString } from "fp-ts/lib/Eq"
import { getUseSuspenseHook } from "../react"

describe("getUseSuspenseHook", () => {
  it("returns the correct values and caches correctly when invalidation is false", async () => {
    const inputUserEq = eq.contramap(eqString, (s: { bar: string }) => s.bar)
    const inputBookEq = eq.contramap(eqString, (s: { user: string }) => s.user)

    const userRTA = jest.fn((_: { bar: string }) => {
      return () => new Promise<either.Either<unknown, { username: string }>>((res) => {
        setTimeout(() => res(either.right({ username: "pippo" })), 500)
      })
    })

    const favBookRTA = jest.fn((_: { user: string }) => {
      return () => new Promise<either.Either<unknown, { title: string }>>((res) => {        
        setTimeout(() => res(either.right({ title: "the Idiot" })), 1000)
      })
    })

    const userHook = getUseSuspenseHook(userRTA, { inputEq: inputUserEq, shouldRefetch: () => false })
    const favBookHook = getUseSuspenseHook(favBookRTA, { inputEq: inputBookEq, shouldRefetch: () => false })

    const User = () => {
      const book = favBookHook({ user: "foo" })

      return <p>{book.title}</p>
    }

    const FavBook = () => {
      const userName = userHook({ bar: "foo" })

      return <p>{userName.username}</p>
    }

    const SuspenceComponent = () => {
      return (
        <React.Suspense fallback={"loading..."}>
          <User />
          <FavBook />
        </React.Suspense>
      )
    }

    const {getByText} = render(<SuspenceComponent />)

    expect(getByText('loading...')).toBeInTheDocument()

    await waitFor(() => getByText("pippo"), {timeout: 2000})

    expect(getByText('pippo')).toBeInTheDocument()
  })
})
