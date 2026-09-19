"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface ClipData {
  id: string;
  status: "processing" | "completed" | "failed";
  videoUrl: string | null;
  sourceImageUrl: string | null;
  vibe: string;
  durationSeconds: number | null;
  trimStart: number;
  trimEnd: number | null;
  transitionIn: "cut" | "crossfade";
  caption: string | null;
  errorMessage: string | null;
}

interface TimelineProps {
  clips: ClipData[];
  onReorder: (orderedIds: string[]) => void;
  onTrimChange: (clipId: string, trimStart: number, trimEnd: number) => void;
  onTransitionChange: (clipId: string, transitionIn: "cut" | "crossfade") => void;
  onCaptionChange: (clipId: string, caption: string) => void;
  onDelete: (clipId: string) => void;
}

export function Timeline({
  clips,
  onReorder,
  onTrimChange,
  onTransitionChange,
  onCaptionChange,
  onDelete,
}: TimelineProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = clips.findIndex((c) => c.id === active.id);
    const newIndex = clips.findIndex((c) => c.id === over.id);
    onReorder(arrayMove(clips, oldIndex, newIndex).map((c) => c.id));
  }

  if (clips.length === 0) {
    return <p className="subtitle">No clips yet — add one from your NFT, an upload, or a generation.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clips.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
        <div className="timeline-track">
          {clips.map((clip, i) => (
            <TimelineItem
              key={clip.id}
              clip={clip}
              index={i}
              onTrimChange={onTrimChange}
              onTransitionChange={onTransitionChange}
              onCaptionChange={onCaptionChange}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function TimelineItem({
  clip,
  index,
  onTrimChange,
  onTransitionChange,
  onCaptionChange,
  onDelete,
}: {
  clip: ClipData;
  index: number;
  onTrimChange: TimelineProps["onTrimChange"];
  onTransitionChange: TimelineProps["onTransitionChange"];
  onCaptionChange: TimelineProps["onCaptionChange"];
  onDelete: TimelineProps["onDelete"];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: clip.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const maxDuration = clip.durationSeconds ?? 0;

  return (
    <div ref={setNodeRef} style={style} className="timeline-item" {...attributes} {...listeners}>
      {clip.status === "completed" && clip.videoUrl && (
        <video src={clip.videoUrl} muted loop autoPlay className="timeline-thumb" />
      )}
      {clip.status === "processing" && <div className="timeline-thumb processing">…</div>}
      {clip.status === "failed" && <div className="timeline-thumb failed">✕</div>}

      <p className="timeline-label">{clip.vibe}</p>

      {clip.status === "completed" && (
        <>
          <div className="trim-row">
            <label>
              in
              <input
                type="number"
                min={0}
                max={maxDuration}
                step={0.1}
                value={clip.trimStart}
                onChange={(e) =>
                  onTrimChange(clip.id, Number(e.target.value), clip.trimEnd ?? maxDuration)
                }
              />
            </label>
            <label>
              out
              <input
                type="number"
                min={0}
                max={maxDuration}
                step={0.1}
                value={clip.trimEnd ?? maxDuration}
                onChange={(e) => onTrimChange(clip.id, clip.trimStart, Number(e.target.value))}
              />
            </label>
          </div>

          {index > 0 && (
            <select
              value={clip.transitionIn}
              onChange={(e) =>
                onTransitionChange(clip.id, e.target.value as "cut" | "crossfade")
              }
            >
              <option value="cut">Cut</option>
              <option value="crossfade">Crossfade</option>
            </select>
          )}

          <input
            type="text"
            placeholder="Caption (optional)"
            defaultValue={clip.caption ?? ""}
            onChange={(e) => onCaptionChange(clip.id, e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </>
      )}

      <button type="button" className="timeline-delete" onClick={() => onDelete(clip.id)}>
        Remove
      </button>
    </div>
  );
}
