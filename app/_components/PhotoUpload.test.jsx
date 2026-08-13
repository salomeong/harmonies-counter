// PhotoUpload owns the one genuinely security-relevant piece of client logic in this feature: the
// cap check that keeps the "+" tile from being offered once a session already has
// MAX_PHOTOS_PER_SESSION photos. The server (app/api/photo-upload/route.js) enforces the same cap
// independently — verified live against a real dev server and the real database during this
// feature's implementation (including bypassing the client entirely and confirming the server
// still rejects with `too_many_photos`), not something Vitest can reach on its own, since it needs
// Postgres and Vercel Blob. This test's job is narrower: prove the CLIENT state combines "already
// saved" and "uploaded this tab" correctly — a bug there would offer an upload the server then has
// to reject with a confusing error, instead of the tile simply not being offered.

import { describe, test, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { PhotoUpload } from "@/app/_components/PhotoUpload.jsx";
import { MAX_PHOTOS_PER_SESSION } from "@/app/_lib/photos.js";

vi.mock("@vercel/blob/client", () => ({
  upload: vi.fn()
}));
import { upload } from "@vercel/blob/client";

afterEach(() => {
  cleanup();
  upload.mockReset();
});

function urls(n, prefix = "existing"){
  return Array.from({ length: n }, (_, i) => `https://example.test/${prefix}-${i}.jpg`);
}

function selectAFile(container){
  const input = container.querySelector('input[type="file"]');
  const file = new File(["fake-bytes"], "board.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
}

test(`the add tile is offered below the cap (${MAX_PHOTOS_PER_SESSION} photos)`, () => {
  const { container } = render(
    <PhotoUpload sessionPublicId="abc123" existingPhotos={urls(MAX_PHOTOS_PER_SESSION - 1)} />
  );
  expect(container.querySelector(".photo-add")).toBeTruthy();
  expect(container.querySelector(".photo-cap-note")).toBeNull();
});

test("the add tile disappears and the cap note appears once existing photos alone reach the cap", () => {
  const { container } = render(
    <PhotoUpload sessionPublicId="abc123" existingPhotos={urls(MAX_PHOTOS_PER_SESSION)} />
  );
  expect(container.querySelector(".photo-add")).toBeNull();
  expect(container.querySelector(".photo-cap-note")).toBeTruthy();
  expect(container.querySelectorAll(".photo-frame").length).toBe(MAX_PHOTOS_PER_SESSION);
});

test("existing photos already saved to the session are rendered as photo frames", () => {
  const existing = urls(2);
  const { container } = render(<PhotoUpload sessionPublicId="abc123" existingPhotos={existing} />);
  const srcs = [...container.querySelectorAll(".photo-frame img")].map(img => img.src);
  expect(srcs).toEqual(existing);
});

// The case that actually matters: not "N already exist" in isolation, but "N already exist, and
// this tab has ALSO optimistically added some" — the cap must account for both together, or a
// session at MAX-1 saved would keep offering uploads forever as long as each one only checked the
// server-known count.
describe("the cap accounts for existing photos and this-tab uploads together", () => {
  test("one photo below the combined cap: still offered before upload, hidden after", async () => {
    upload.mockResolvedValue({ url: "https://example.test/uploaded-0.jpg" });
    const { container } = render(
      <PhotoUpload sessionPublicId="abc123" existingPhotos={urls(MAX_PHOTOS_PER_SESSION - 1)} />
    );
    expect(container.querySelector(".photo-add")).toBeTruthy();

    selectAFile(container);
    await waitFor(() => expect(container.querySelector(".photo-add")).toBeNull());

    expect(container.querySelector(".photo-cap-note")).toBeTruthy();
    expect(container.querySelectorAll(".photo-frame").length).toBe(MAX_PHOTOS_PER_SESSION);
    // The newly uploaded one is the last frame — proving the combined list, not a re-render that
    // happened to already have MAX_PHOTOS_PER_SESSION existing ones, is what's rendered.
    const frames = [...container.querySelectorAll(".photo-frame img")];
    expect(frames[frames.length - 1].src).toBe("https://example.test/uploaded-0.jpg");
  });

  test("upload() is called with this session's public id in the client payload, never another session's", async () => {
    upload.mockResolvedValue({ url: "https://example.test/uploaded-0.jpg" });
    const { container } = render(<PhotoUpload sessionPublicId="the-real-session" existingPhotos={[]} />);
    selectAFile(container);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    const [pathname, , options] = upload.mock.calls[0];
    expect(pathname.startsWith("sessions/the-real-session/")).toBe(true);
    expect(JSON.parse(options.clientPayload)).toEqual({ sessionPublicId: "the-real-session" });
    expect(options.handleUploadUrl).toBe("/api/photo-upload");
  });

  test("a failed upload shows an inline error and leaves the add tile available to retry", async () => {
    upload.mockRejectedValue(new Error("network down"));
    const { container } = render(<PhotoUpload sessionPublicId="abc123" existingPhotos={[]} />);
    selectAFile(container);
    await waitFor(() => expect(container.querySelector(".photo-error")).toBeTruthy());
    expect(container.querySelector(".photo-add")).toBeTruthy();
    expect(container.querySelectorAll(".photo-frame").length).toBe(0);
  });
});
