"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dragStageAction } from "@/app/(app)/pipeline/actions";

export type BoardLead = {
  id: number;
  stage: string;
  name: string;
  contact: string | null;
  cheque: string | null;
  badge: string | null;
  badgeGrey: boolean;
  due: { label: string; warn: boolean } | null;
  action: string | null;
};

/** The pipeline board. Cards can be dragged between columns, or opened with a click. */
export function Board({ columns, leads }: { columns: { key: string; label: string }[]; leads: BoardLead[] }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="board" style={pending ? { opacity: 0.6 } : undefined}>
      {columns.map((col) => {
        const inCol = leads.filter((l) => l.stage === col.key);
        return (
          <div
            key={col.key}
            className={`col ${over === col.key ? "over" : ""}`}
            onDragOver={(e) => {
              if (dragging == null) return;
              e.preventDefault();
              setOver(col.key);
            }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const id = dragging;
              setOver(null);
              setDragging(null);
              const lead = leads.find((l) => l.id === id);
              if (id == null || !lead || lead.stage === col.key) return;
              start(() => dragStageAction(id, col.key));
            }}
          >
            <h3><span>{col.label}</span><span>{inCol.length}</span></h3>
            {inCol.length === 0 && <div className="muted small" style={{ marginTop: 8 }}>—</div>}
            {inCol.map((l) => (
              <Link
                key={l.id}
                href={`/pipeline/${l.id}`}
                className={`lead ${dragging === l.id ? "dragging" : ""}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(l.id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
              >
                <strong>{l.name}</strong>
                {l.contact && <div className="muted small">{l.contact}</div>}
                <div className="row small" style={{ marginTop: 4, gap: 6 }}>
                  {l.cheque && <span>{l.cheque}</span>}
                  {l.badge && <span className={`badge ${l.badgeGrey ? "grey" : ""}`}>{l.badge}</span>}
                </div>
                {(l.action || l.due) && (
                  <div className="small" style={{ marginTop: 6 }}>
                    {l.due && <span className={`badge ${l.due.warn ? "warn" : "grey"}`}>{l.due.label}</span>} {l.action}
                  </div>
                )}
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
