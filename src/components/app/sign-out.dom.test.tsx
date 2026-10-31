import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SignOutButton } from "./sign-out";

const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => ({})) }));
const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: auth }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

it("signs out once, showing that it's working, then goes to login", async () => {
  let finish!: () => void;
  auth.signOut.mockReturnValue(
    new Promise<object>((r) => (finish = () => r({}))),
  );
  render(<SignOutButton />);
  const button = screen.getByRole("button", { name: "Sign out" });
  await userEvent.click(button);
  expect(button).toBeDisabled();
  expect(button).toHaveTextContent("Signing out…");
  await userEvent.click(button);
  expect(auth.signOut).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
});
