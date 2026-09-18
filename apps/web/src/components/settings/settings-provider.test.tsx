// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { setActiveAccount } from "@/lib/storage-client";
import { SettingsProvider, useSettings } from "./settings-provider";

beforeEach(() => {
  setActiveAccount(undefined);
});

describe("SettingsProvider.update()", () => {
  it("does not stamp syncFieldUpdatedAt for a guest", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => { expect(result.current.ready).toBe(true); });

    await act(async () => {
      await result.current.update({ theme: "dark" });
    });

    expect(result.current.stored?.theme).toBe("dark");
    expect(result.current.stored?.syncFieldUpdatedAt).toBeUndefined();
  });

  it("stamps syncFieldUpdatedAt for changed fields when signed in, but never for device-only fields", async () => {
    setActiveAccount("acct-settings-test");
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => { expect(result.current.ready).toBe(true); });

    await act(async () => {
      await result.current.update({ theme: "dark", persistentStorage: "granted" });
    });

    expect(result.current.stored?.theme).toBe("dark");
    expect(result.current.stored?.syncFieldUpdatedAt?.theme).toBeTypeOf("string");
    expect(result.current.stored?.syncFieldUpdatedAt?.persistentStorage).toBeUndefined();
  });

  it("preserves an earlier field's timestamp when a later, unrelated field changes", async () => {
    setActiveAccount("acct-settings-test-2");
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => { expect(result.current.ready).toBe(true); });

    await act(async () => {
      await result.current.update({ theme: "dark" });
    });
    const themeStamp = result.current.stored?.syncFieldUpdatedAt?.theme;
    expect(themeStamp).toBeTypeOf("string");

    await act(async () => {
      await result.current.update({ compactLayout: true });
    });

    expect(result.current.stored?.syncFieldUpdatedAt?.theme).toBe(themeStamp);
    expect(result.current.stored?.syncFieldUpdatedAt?.compactLayout).toBeTypeOf("string");
  });
});
