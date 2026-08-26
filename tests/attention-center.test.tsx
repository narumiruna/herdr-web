import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  deriveAttentionGroups,
  parseAttentionPreferences,
  useAttentionCenter,
} from "../src/attention-center";
import { AttentionInbox } from "../src/components/AttentionInbox";
import { createDemoState, type HerdrState } from "../src/state";

class FakeNotification {
  static permission = "granted";
  static instances: FakeNotification[] = [];
  static throwOnCreate = false;
  onclick?: () => void;
  close = vi.fn();

  constructor(
    readonly title: string,
    readonly options?: NotificationOptions,
  ) {
    if (FakeNotification.throwOnCreate) throw new Error("Notification failed");
    FakeNotification.instances.push(this);
  }

  static requestPermission = vi.fn().mockResolvedValue("granted");
}

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  FakeNotification.instances = [];
  FakeNotification.throwOnCreate = false;
  vi.stubGlobal("Notification", FakeNotification);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

function attentionState(status: "blocked" | "done" | "idle"): HerdrState {
  const state = structuredClone(createDemoState());
  const agent = state.agents.find(({ id }) => id === "agent-review");
  if (!agent) throw new Error("Missing demo Agent");
  agent.status = status;
  agent.updated = `revision-${status}`;
  return state;
}

function NotificationHarness({
  backgroundPushActive = false,
  state,
}: {
  backgroundPushActive?: boolean;
  state: HerdrState;
}) {
  const center = useAttentionCenter({
    isBackgroundPushActive: () => backgroundPushActive,
    onOpenAgent: vi.fn(),
    state,
  });
  return (
    <button
      type="button"
      onClick={() =>
        center.patch({ cooldownMs: 5_000, notificationEnabled: true })
      }
    >
      Enable
    </button>
  );
}

describe("attention supervision", () => {
  test("defensively parses preferences and derives only unreviewed real attention", () => {
    expect(parseAttentionPreferences("not json").version).toBe(1);
    const state = attentionState("blocked");
    const preferences = parseAttentionPreferences(null);
    const failedAgent = state.agents.find(({ id }) => id === "agent-build");
    if (!failedAgent) throw new Error("Missing demo Agent");
    failedAgent.status = "failed";
    const groups = deriveAttentionGroups(state, preferences, 100);
    expect(groups.failed.map(({ agent }) => agent.id)).toContain("agent-build");
    expect(groups.needsInput.map(({ agent }) => agent.id)).toContain(
      "agent-review",
    );
    preferences.reviewedKeys["agent-review"] = groups.needsInput[0]?.key ?? "";
    expect(deriveAttentionGroups(state, preferences, 100).needsInput).toEqual(
      [],
    );
  });

  test("notifies only on transitions and deduplicates the same Agent state", async () => {
    const view = render(<NotificationHarness state={attentionState("idle")} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Enable" }));

    view.rerender(<NotificationHarness state={attentionState("blocked")} />);
    await waitFor(() => expect(FakeNotification.instances).toHaveLength(1));
    expect(FakeNotification.instances[0]?.title).toContain("needs input");
    expect(FakeNotification.instances[0]?.options?.data).toMatchObject({
      url: expect.stringContaining("pane=review-main"),
    });

    view.rerender(<NotificationHarness state={attentionState("blocked")} />);
    await act(() => Promise.resolve());
    expect(FakeNotification.instances).toHaveLength(1);

    view.rerender(<NotificationHarness state={attentionState("idle")} />);
    await act(() => Promise.resolve());
    view.rerender(<NotificationHarness state={attentionState("done")} />);
    await act(() => Promise.resolve());
    expect(FakeNotification.instances).toHaveLength(1);
  });

  test("uses foreground delivery until bridge registration confirms background Push", async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({
              endpoint: "https://push.example.test/unsaved",
            }),
          },
          showNotification,
        }),
        removeEventListener: vi.fn(),
      },
    });
    const view = render(<NotificationHarness state={attentionState("idle")} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Enable" }));

    view.rerender(<NotificationHarness state={attentionState("blocked")} />);

    await waitFor(() => expect(showNotification).toHaveBeenCalledOnce());
    expect(FakeNotification.instances).toHaveLength(0);
  });

  test("suppresses foreground delivery after bridge registration succeeds", async () => {
    const view = render(
      <NotificationHarness
        backgroundPushActive
        state={attentionState("idle")}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Enable" }));

    view.rerender(
      <NotificationHarness
        backgroundPushActive
        state={attentionState("blocked")}
      />,
    );
    await act(() => Promise.resolve());

    expect(FakeNotification.instances).toHaveLength(0);
  });

  test("records deduplication only after notification delivery succeeds", async () => {
    const view = render(<NotificationHarness state={attentionState("idle")} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Enable" }));
    FakeNotification.throwOnCreate = true;
    view.rerender(<NotificationHarness state={attentionState("blocked")} />);
    await act(() => Promise.resolve());
    expect(FakeNotification.instances).toHaveLength(0);

    view.rerender(<NotificationHarness state={attentionState("idle")} />);
    await act(() => Promise.resolve());
    FakeNotification.throwOnCreate = false;
    view.rerender(<NotificationHarness state={attentionState("blocked")} />);
    await waitFor(() => expect(FakeNotification.instances).toHaveLength(1));
  });

  test("private notifications hide Agent and Space identity", async () => {
    window.localStorage.setItem(
      "herdr-web-attention-preferences",
      JSON.stringify({
        notificationEnabled: true,
        notificationPrivacy: "private",
        version: 1,
      }),
    );
    const view = render(<NotificationHarness state={attentionState("idle")} />);
    view.rerender(<NotificationHarness state={attentionState("blocked")} />);
    await waitFor(() => expect(FakeNotification.instances).toHaveLength(1));
    expect(FakeNotification.instances[0]?.title).toBe(
      "A Herdr Agent needs attention",
    );
    expect(FakeNotification.instances[0]?.title).not.toContain("api-review");
    expect(FakeNotification.instances[0]?.options?.body).not.toContain(
      "compatibility decision",
    );
  });

  test("notifies a new Done transition with the exact pane deep link", async () => {
    const view = render(<NotificationHarness state={attentionState("idle")} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Enable" }));

    view.rerender(<NotificationHarness state={attentionState("done")} />);
    await waitFor(() => expect(FakeNotification.instances).toHaveLength(1));
    expect(FakeNotification.instances[0]?.title).toContain("completed");
    expect(FakeNotification.instances[0]?.options?.data).toMatchObject({
      url: expect.stringContaining("pane=review-main"),
    });
  });

  test("triages previews, quick replies, snooze, mute, review, and next-item keys", async () => {
    const state = attentionState("blocked");
    const done = state.agents.find(({ id }) => id === "agent-tests");
    if (!done) throw new Error("Missing done Agent");
    const preferences = parseAttentionPreferences(null);
    const groups = deriveAttentionGroups(state, preferences, Date.now());
    const onPrompt = vi.fn().mockResolvedValue(undefined);
    const onMute = vi.fn();
    const onSnooze = vi.fn();
    const onReview = vi.fn();
    const user = userEvent.setup();

    render(
      <AttentionInbox
        canReply
        groups={groups}
        open
        preferences={preferences}
        state={state}
        onMarkReviewed={onReview}
        onMute={onMute}
        onOpenAgent={vi.fn()}
        onOpenChange={vi.fn()}
        onPrompt={onPrompt}
        onSnooze={onSnooze}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Attention Inbox" }),
    ).toBeVisible();
    expect(screen.getByRole("document")).toHaveTextContent("Decision needed");
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(onMute).toHaveBeenCalledWith("agent-review", true);
    await user.click(screen.getByRole("button", { name: "Snooze 15m" }));
    expect(onSnooze).toHaveBeenCalledWith("agent-review", 15 * 60_000);
    await user.type(screen.getByLabelText("Quick reply"), "Keep numeric IDs");
    await user.click(screen.getByRole("button", { name: "Send and next" }));
    expect(onPrompt).toHaveBeenCalledWith("agent-review", "Keep numeric IDs");
    expect(onReview).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-review" }),
    );
  });
});
