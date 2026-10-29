import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const auth = vi.hoisted(() => ({
  signIn: { social: vi.fn(), passkey: vi.fn(), email: vi.fn() },
}));
const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: auth }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const fetchSpy = vi.fn(async () => new Response("{}"));

beforeEach(() => {
  for (const f of Object.values(auth.signIn)) f.mockReset();
  nav.replace.mockReset();
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});

it("wakes the server when the page opens, so a passkey answers sooner", () => {
  render(<LoginForm next="/today" passwordEnabled={false} />);
  expect(fetchSpy).toHaveBeenCalledWith("/api/health", { cache: "no-store" });
});

it("a passkey sign-in shows it's working and can't be started twice", async () => {
  let finish!: (v: { error: null }) => void;
  auth.signIn.passkey.mockReturnValue(new Promise((r) => (finish = r)));
  render(<LoginForm next="/today" passwordEnabled={false} />);
  const passkey = screen.getByRole("button", { name: "Sign in with passkey" });
  await userEvent.click(passkey);
  expect(passkey).toHaveTextContent("Signing in…");
  expect(passkey).toBeDisabled();
  expect(
    screen.getByRole("button", { name: /Continue with Google/ }),
  ).toBeDisabled();
  await userEvent.click(passkey);
  expect(auth.signIn.passkey).toHaveBeenCalledTimes(1);
  finish({ error: null });
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/today"));
});

it("a cancelled passkey lets you try again, with the reason", async () => {
  auth.signIn.passkey.mockResolvedValue({ error: { message: "Cancelled" } });
  render(<LoginForm next="/today" passwordEnabled={false} />);
  const passkey = screen.getByRole("button", { name: "Sign in with passkey" });
  await userEvent.click(passkey);
  expect(await screen.findByRole("alert")).toHaveTextContent("Cancelled");
  expect(passkey).toBeEnabled();
  expect(passkey).toHaveTextContent("Sign in with passkey");
});

it("Google and password sign-in show they're working too", async () => {
  auth.signIn.social.mockReturnValue(new Promise(() => {}));
  auth.signIn.email.mockReturnValue(new Promise(() => {}));
  const { unmount } = render(<LoginForm next="/today" passwordEnabled />);
  const google = screen.getByRole("button", { name: "Continue with Google" });
  await userEvent.click(google);
  expect(google).toHaveTextContent("Signing in…");
  expect(google).toBeDisabled();
  unmount();
  render(<LoginForm next="/today" passwordEnabled />);
  await userEvent.type(screen.getByTestId("password-email"), "me@x.com");
  await userEvent.type(screen.getByTestId("password-password"), "pw");
  await userEvent.click(screen.getByTestId("password-submit"));
  expect(screen.getByTestId("password-submit")).toBeDisabled();
  expect(screen.getByTestId("password-submit")).toHaveTextContent(
    "Signing in…",
  );
});
