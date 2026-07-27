"use client";
import { useState } from "react";
import type { Campaign, CampaignTag } from "@/lib/types";
import { ALL_CAMPAIGN_TAGS, TAG_LABEL } from "@/lib/types";
import { SlideOver } from "./SlideOver";

export function EditCampaignMetaButton({
  campaign,
  onSaved,
  onDeleted,
}: {
  campaign: Campaign;
  onSaved: (c: Campaign) => void;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="ml-2 inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--muted-2)] hover:text-[var(--foreground)] hover:bg-gray-100 transition-colors"
        onClick={() => setOpen(true)}
        aria-label="Edit campaign details"
        title="Edit name, goal, tags"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15.232 5.232a2.5 2.5 0 013.536 3.536L7.5 20H4v-3.5L15.232 5.232z" />
        </svg>
      </button>
      {open && (
        <EditCampaignMetaSlideOver
          campaign={campaign}
          onClose={() => setOpen(false)}
          onSaved={(c) => { onSaved(c); setOpen(false); }}
          onDeleted={onDeleted ? () => { onDeleted(); setOpen(false); } : undefined}
        />
      )}
    </>
  );
}

function EditCampaignMetaSlideOver({
  campaign,
  onClose,
  onSaved,
  onDeleted,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSaved: (c: Campaign) => void;
  onDeleted?: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [goal, setGoal] = useState(campaign.goal);
  const [tags, setTags] = useState<CampaignTag[]>(campaign.tags);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!onDeleted) return;
    setDeleting(true);
    try {
      await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  function toggleTag(t: CampaignTag) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || campaign.name, goal, tags }),
      });
      const updated: Campaign = await res.json();
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlideOver title="Edit campaign" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label>Goal</label>
          <textarea rows={5} value={goal} onChange={(e) => setGoal(e.target.value)} />
          <p className="mt-1 text-[11px] text-[var(--muted)]">The rehearsal engine uses this verbatim when scoring the campaign.</p>
        </div>
        <div>
          <label>Tags</label>
          <div className="flex gap-2 flex-wrap">
            {ALL_CAMPAIGN_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`chip cursor-pointer ${tags.includes(t) ? "chip-accent" : ""}`}
              >{TAG_LABEL[t]}</button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">Tags class the campaign so the score compares apples to apples.</p>
        </div>
        <div className="pt-4 flex items-center gap-2 border-t border-[var(--border)] -mx-6 px-6">
          {onDeleted && (
            confirmDelete ? (
              <div className="flex items-center gap-2 mr-auto">
                <span className="text-[12px] text-[var(--danger)] font-medium">
                  Delete this campaign?
                </span>
                <button
                  className="btn btn-danger !py-1 !px-2 !text-[12px]"
                  onClick={remove}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  className="btn btn-ghost !py-1 !px-2 !text-[12px]"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn-danger mr-auto"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                Delete
              </button>
            )
          )}
          <button className="btn btn-secondary" onClick={onClose} disabled={saving || deleting}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || deleting || confirmDelete}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </SlideOver>
  );
}
