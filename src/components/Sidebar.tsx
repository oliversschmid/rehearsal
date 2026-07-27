"use client";
import Link from "next/link";
import { useState } from "react";
import { BuildNoteModal } from "./BuildNoteModal";

const NAV = [
  { href: "/campaigns", label: "Campaigns", icon: FlowIcon },
  { href: "/audiences", label: "Audiences", icon: PeopleIcon },
];

export function Sidebar() {
  const [buildNoteOpen, setBuildNoteOpen] = useState(false);
  return (
    <aside
      data-ui="v2"
      className="sticky top-0 self-start h-screen flex flex-col"
      style={{ background: "#f5f5f5", borderRight: "1px solid #ececec" }}
    >
      {/* Workspace chip */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <div className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)] min-w-0">
          <div className="w-5 h-5 rounded-[5px] bg-[var(--foreground)] text-white grid place-items-center text-[10px] font-semibold shrink-0">
            V
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-tight truncate">
              Verve &amp; Vine
            </div>
          </div>
        </div>
      </div>

      <nav className="px-3 pt-3">
        <ul className="space-y-0.5">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link
                href={n.href}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--sidebar-hover)]"
              >
                <span className="text-[var(--muted)] shrink-0">
                  <n.icon />
                </span>
                <span className="flex-1 truncate">{n.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto p-3">
        <button
          onClick={() => setBuildNoteOpen(true)}
          className="block w-full text-left transition-transform hover:-translate-y-0.5"
          style={{
            background: "#ffe8d1",
            border: "1px solid #f5c78a",
            borderRadius: 6,
            padding: "12px 14px",
            boxShadow:
              "0 1px 0 rgba(0,0,0,0.02), 0 6px 12px -6px rgba(180,90,20,0.18)",
          }}
        >
          <div
            className="text-[13px] font-semibold leading-tight"
            style={{ color: "#8a4515" }}
          >
            Build note
          </div>
        </button>
      </div>

      {buildNoteOpen && <BuildNoteModal onClose={() => setBuildNoteOpen(false)} />}
    </aside>
  );
}

function FlowIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <rect x="4" y="3" width="16" height="4" rx="1" />
      <rect x="4" y="10" width="16" height="4" rx="1" />
      <rect x="4" y="17" width="16" height="4" rx="1" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3 3-5 7-5s7 2 7 5" />
      <circle cx="17" cy="6" r="2.5" />
      <path d="M15 15c4-.2 7 1.5 7 5" />
    </svg>
  );
}
