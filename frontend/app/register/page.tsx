"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

export default function RegisterPage() {

  const router = useRouter();

  const [email,
    setEmail] =
    useState("");

  const [password,
    setPassword] =
    useState("");

  const [loading,
    setLoading] =
    useState(false);

  const handleRegister =
    async () => {

      try {

        setLoading(true);

        const response =
          await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/register`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                email,
                password,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {

          alert(
            data.detail
          );

          return;
        }

        router.push(
          "/login"
        );

      } catch (error) {

        console.error(error);

      } finally {

        setLoading(false);

      }
    };

  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">

      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-8">

        <h1 className="text-3xl font-bold">
          Register
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          Create your AI workspace
        </p>

        <div className="mt-8 space-y-4">

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) =>
              setEmail(
                e.target.value
              )
            }
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 outline-none"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value
              )
            }
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 outline-none"
          />

          <button
            onClick={
              handleRegister
            }
            disabled={loading}
            className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black disabled:opacity-50"
          >
            {
              loading
                ? "Loading..."
                : "Register"
            }
          </button>

        </div>

      </div>

    </div>
  );
}