import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FounderCard, FounderNote } from "./founder-card";
import type { FounderPublic } from "./use-founder";

// buildApiUrl needs NEXT_PUBLIC_API_URL, which a unit test doesn't have.
vi.mock("@/constants/config", () => ({ buildApiUrl: (path: string) => `https://api.test${path}` }));

beforeEach(() => {
  // jsdom has no matchMedia; Reveal reads it for the reduced-motion preference.
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
});

// Same for IntersectionObserver (Reveal waits for scroll with it). Real browsers all have it.
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

const base: FounderPublic = {
  enabled: true,
  name: "Ada Lovelace",
  title: "",
  note: "First paragraph.\n\nSecond paragraph.",
  photo_url: null,
  links: [],
};

afterEach(cleanup);

describe("FounderCard", () => {
  it("shows the name and the note's paragraphs, and invents nothing else", () => {
    const { container } = render(<FounderCard founder={base} />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull(); // no photo uploaded -> no avatar
    expect(container.querySelector("ul")).toBeNull(); // no links -> no empty list
    expect(screen.queryByText(/founder,/i)).toBeNull(); // no title -> no role line
  });

  it("renders the optional parts only when they exist", () => {
    render(
      <FounderCard
        founder={{
          ...base,
          title: "Founder, Querex",
          photo_url: "/app/founder/photo?v=1",
          links: [
            { kind: "github", label: "GitHub", url: "https://github.com/ada" },
            { kind: "website", label: "Website", url: "https://ada.dev" },
          ],
        }}
      />,
    );
    expect(screen.getByText("Founder, Querex")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Photo of Ada Lovelace" })).toHaveAttribute(
      "src",
      "https://api.test/app/founder/photo?v=1",
    );
    const github = screen.getByRole("link", { name: /Ada Lovelace on GitHub/ });
    expect(github).toHaveAttribute("href", "https://github.com/ada");
    expect(github).toHaveAttribute("target", "_blank");
    expect(github).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("uses an explicit photo source (the admin preview's local copy) over the public URL", () => {
    render(<FounderCard founder={{ ...base, photo_url: "/app/founder/photo?v=1" }} photoSrc="blob:preview" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:preview");
  });

  it("treats the note as text, never as markup", () => {
    const { container } = render(<FounderCard founder={{ ...base, note: "<script>alert(1)</script><b>x</b>" }} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<script>alert(1)</script><b>x</b>")).toBeInTheDocument();
  });
});

describe("FounderNote (the homepage section)", () => {
  function renderWith(payload: FounderPublic) {
    vi.resetModules();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["founder"], payload);
    return render(
      <QueryClientProvider client={client}>
        <FounderNote />
      </QueryClientProvider>,
    );
  }

  it("renders nothing at all when the section is not published", async () => {
    const { container } = renderWith({ enabled: false, name: "", title: "", note: "", photo_url: null, links: [] });
    await waitFor(() => expect(container.querySelector("section")).toBeNull());
    expect(screen.queryByText(/a note from the founder/i)).toBeNull();
  });

  it("renders the section when it is published", async () => {
    renderWith(base);
    expect(await screen.findByText(/a note from the founder/i)).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });
});
