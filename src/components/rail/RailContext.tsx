"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CopilotMessage } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Rail slot state — what each page injects into the rail shell.     */
/* ------------------------------------------------------------------ */

export type RailSlotContent = {
  headerLabel: string;
  headerTitle: string;
  body: React.ReactNode;
  dockPlaceholder?: string;
  /** Campaign the current dock message should attach to (undefined = list-level). */
  campaignId?: string;
  /** If true, the CopilotDock is hidden and the body fills the whole rail. */
  hideDock?: boolean;
  /** If true, the rail header (label + title) is not rendered at all. */
  hideHeader?: boolean;
  /** If true, the body area drops its padding + scroll wrapper so a panel
   * (e.g. a chat surface) can own its own layout and fill the height. */
  bodyFillHeight?: boolean;
  /** Optional right-hand chip in the header (e.g. grounding badge). */
  headerAside?: React.ReactNode;
};

/** State the flow editor pushes so the rail can flip Verdict → stale. */
export type StaleState = {
  stale: boolean;
  setStale: (v: boolean) => void;
};

/** State for a live copilot streaming operation attached to a campaign. */
export type CopilotStreamStatus = {
  campaignId: string;
  campaignName: string;
  label: string;
} | null;

/* ------------------------------------------------------------------ */
/*  Copilot conversation state — global for the session               */
/* ------------------------------------------------------------------ */

export type DockMessage = CopilotMessage & { campaignId?: string };

type CopilotDockState = {
  messages: DockMessage[];
  appendUser: (content: string, campaignId?: string) => DockMessage;
  appendAssistant: (msg: CopilotMessage, campaignId?: string) => void;
  sending: boolean;
  setSending: (v: boolean) => void;
  streamStatus: CopilotStreamStatus;
  setStreamStatus: (s: CopilotStreamStatus) => void;
};

/* ------------------------------------------------------------------ */
/*  Contexts                                                          */
/* ------------------------------------------------------------------ */

type RailContextValue = {
  slot: RailSlotContent | null;
  setSlot: (s: RailSlotContent | null) => void;
  stale: StaleState;
  copilot: CopilotDockState;
  /** Called when the rail's stale banner "Re-run" is clicked. Pages register. */
  onRerun: (() => void) | null;
  setOnRerun: (fn: (() => void) | null) => void;
};

const RailContext = createContext<RailContextValue | null>(null);

export function useRail(): RailContextValue {
  const ctx = useContext(RailContext);
  if (!ctx) {
    // In non-rail environments (SSR of a page before layout, or misuse),
    // return an inert value so components don't crash.
    return {
      slot: null,
      setSlot: () => {},
      stale: { stale: false, setStale: () => {} },
      copilot: {
        messages: [],
        appendUser: () => ({ id: "", role: "user", content: "", createdAt: "" }),
        appendAssistant: () => {},
        sending: false,
        setSending: () => {},
        streamStatus: null,
        setStreamStatus: () => {},
      },
      onRerun: null,
      setOnRerun: () => {},
    };
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

export function RailProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<RailSlotContent | null>(null);
  const [stale, setStaleFlag] = useState(false);
  const [messages, setMessages] = useState<DockMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<CopilotStreamStatus>(null);
  const [onRerun, setOnRerun] = useState<(() => void) | null>(null);

  const appendUser = useCallback((content: string, campaignId?: string): DockMessage => {
    const msg: DockMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
      campaignId,
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const appendAssistant = useCallback((msg: CopilotMessage, campaignId?: string) => {
    setMessages((prev) => [...prev, { ...msg, campaignId }]);
  }, []);

  // Stable sub-objects — recomputed only when their own primitive state
  // changes. Without this, every setSlot would spawn a new `stale`/`copilot`
  // object reference, invalidating any consumer's useCallback deps and
  // pumping <RailSlot>'s useEffect into an infinite update loop.
  const staleValue = useMemo(
    () => ({ stale, setStale: setStaleFlag }),
    [stale],
  );
  const copilotValue = useMemo(
    () => ({
      messages,
      appendUser,
      appendAssistant,
      sending,
      setSending,
      streamStatus,
      setStreamStatus,
    }),
    [messages, appendUser, appendAssistant, sending, streamStatus],
  );

  const value = useMemo<RailContextValue>(
    () => ({
      slot,
      setSlot,
      stale: staleValue,
      copilot: copilotValue,
      onRerun,
      setOnRerun,
    }),
    [slot, staleValue, copilotValue, onRerun],
  );

  return <RailContext.Provider value={value}>{children}</RailContext.Provider>;
}

/* ------------------------------------------------------------------ */
/*  <RailSlot> — declarative slot injector for pages                  */
/* ------------------------------------------------------------------ */

export function RailSlot(props: RailSlotContent) {
  const { setSlot } = useRail();
  useEffect(() => {
    setSlot(props);
    return () => setSlot(null);
    // Callers MUST memoize `body` and `headerAside` (they are JSX and
    // otherwise churn their reference every render, pumping this effect
    // into an infinite loop with the RailProvider state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.headerLabel,
    props.headerTitle,
    props.body,
    props.dockPlaceholder,
    props.campaignId,
    props.hideDock,
    props.hideHeader,
    props.bodyFillHeight,
    props.headerAside,
  ]);
  return null;
}

/**
 * Small helper that lets a page register a callback for the rail's
 * stale banner "Re-run" button (needed because the button lives in
 * the layout but the action is per-page).
 */
export function useRegisterRerun(fn: (() => void) | null) {
  const { setOnRerun } = useRail();
  useEffect(() => {
    setOnRerun(fn);
    return () => setOnRerun(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn]);
}
