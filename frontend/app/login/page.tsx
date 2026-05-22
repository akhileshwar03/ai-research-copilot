"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import Link from "next/link";

export default function LoginPage() {

  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const handleLogin =
    async () => {

      try {

        setLoading(true);

        const API_URL =
          process.env
            .NEXT_PUBLIC_API_URL;

        if (!API_URL) {

          alert(
            "API URL missing"
          );

          return;
        }

        const response =
          await fetch(
            `${API_URL}/login`,
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

        console.log(data);

        if (!response.ok) {

          alert(
            data.detail ||
            "Login failed"
          );

          return;
        }

        localStorage.setItem(
          "token",
          data.token
        );

        router.push("/chat");

      } catch (error) {

        console.error(error);

        alert(
          "Cannot connect to backend"
        );

      } finally {

        setLoading(false);

      }
    };

  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">

      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-8">

        <h1 className="text-3xl font-bold">
          Login
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          Access your AI workspace
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
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black disabled:opacity-50"
          >
            {
              loading
                ? "Loading..."
                : "Login"
            }
          </button>

          <p className="text-center text-sm text-zinc-500">

            New user?{" "}

            <Link
              href="/register"
              className="text-white underline"
            >
              Register
            </Link>

          </p>

        </div>

      </div>

    </div>
  );
}