import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppShell } from "@/components/AppShell";
import { ChatPanel } from "@/components/ChatPanel";
import { CardDialog } from "@/components/CardDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, MessageSquare, Calendar, Lock, Building2, Briefcase } from "lucide-react";
import { format, isPast, isToday } from "date-fns";

type Board = { id: number; name: string; slug: string; description: string | null; kind: string };
type Column = { id: number; boardId: number; name: string; position: number };
type Card = {
  id: number;
  boardId: number;
  columnId: number;
  title: string;
  description: string | null;
  assigneeId: number | null;
  priority: "low" | "medium" | "high";
  tags: string;
  dueDate: number | string | null;
  position: number;
  source: string;
};
type SafeUser = { id: number; name: string; email: string };

export default function Board() {
  const [, params] = useRoute("/board/:slug");
  const slug = params?.slug || "";
  const [chatOpen, setChatOpen] = useState(false);
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [composing, setComposing] = useState<{ columnId: number } | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const boardQ = useQuery<{ board: Board; columns: Column[]; cards: Card[] }>({
    queryKey: ["/api/boards", slug],
    enabled: !!slug,
  });
  const usersQ = useQuery<{ users: SafeUser[] }>({ queryKey: ["/api/users"] });

  const moveMut = useMutation({
    mutationFn: async (vars: { id: number; columnId: number; position: number }) => {
      const res = await apiRequest("POST", `/api/cards/${vars.id}/move`, {
        columnId: vars.columnId,
        position: vars.position,
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/boards", slug] }),
  });

  const createMut = useMutation({
    mutationFn: async (vars: { boardId: number; columnId: number; title: string }) => {
      const res = await apiRequest("POST", "/api/cards", {
        boardId: vars.boardId,
        columnId: vars.columnId,
        title: vars.title,
        priority: "medium",
        tags: "[]",
        position: 0,
        source: "manual",
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/boards", slug] }),
  });

  const cardsByCol = useMemo(() => {
    const out: Record<number, Card[]> = {};
    (boardQ.data?.cards || []).forEach((c) => {
      out[c.columnId] = out[c.columnId] || [];
      out[c.columnId].push(c);
    });
    return out;
  }, [boardQ.data]);

  if (!slug) return <AppShell><div className="p-8">Loading…</div></AppShell>;
  if (boardQ.isLoading) return <AppShell><div className="p-8 text-muted-foreground">Loading board…</div></AppShell>;
  if (!boardQ.data) return <AppShell><div className="p-8">Board not found</div></AppShell>;

  const { board, columns } = boardQ.data;
  const KindIcon = board.kind === "company" ? Building2 : board.kind === "personal" ? Lock : Briefcase;

  const onDrop = (e: React.DragEvent, columnId: number) => {
    e.preventDefault();
    if (draggingId == null) return;
    moveMut.mutate({ id: draggingId, columnId, position: 0 });
    setDraggingId(null);
  };

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <KindIcon className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="text-xl font-semibold" data-testid="text-board-name">{board.name}</h1>
              {board.description && (
                <p className="text-xs text-muted-foreground">{board.description}</p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setChatOpen(!chatOpen)}
            data-testid="button-toggle-chat"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            {chatOpen ? "Close chat" : "Ask the agent"}
          </Button>
        </header>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-4 h-full min-w-max">
              {columns.map((col) => (
                <div
                  key={col.id}
                  className="w-72 shrink-0 flex flex-col rounded-lg border bg-card/50"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, col.id)}
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{col.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {(cardsByCol[col.id] || []).length}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
                    {(cardsByCol[col.id] || []).map((card) => (
                      <KanbanCard
                        key={card.id}
                        card={card}
                        users={usersQ.data?.users || []}
                        onOpen={() => setOpenCard(card)}
                        onDragStart={() => setDraggingId(card.id)}
                      />
                    ))}
                    {composing?.columnId === col.id ? (
                      <ComposeCard
                        onCancel={() => setComposing(null)}
                        onCreate={(title) => {
                          createMut.mutate({ boardId: board.id, columnId: col.id, title });
                          setComposing(null);
                        }}
                      />
                    ) : (
                      <button
                        className="w-full rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover-elevate"
                        onClick={() => setComposing({ columnId: col.id })}
                        data-testid={`button-add-card-${col.id}`}
                      >
                        <Plus className="inline h-3 w-3 mr-1" /> Add a card
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {chatOpen && <ChatPanel boardSlug={slug} boardName={board.name} />}
        </div>
      </div>

      {openCard && (
        <CardDialog
          card={openCard}
          users={usersQ.data?.users || []}
          columns={columns}
          onClose={() => setOpenCard(null)}
          slug={slug}
        />
      )}
    </AppShell>
  );
}

function KanbanCard({
  card,
  users,
  onOpen,
  onDragStart,
}: {
  card: Card;
  users: SafeUser[];
  onOpen: () => void;
  onDragStart: () => void;
}) {
  const assignee = users.find((u) => u.id === card.assigneeId);
  const tags: string[] = (() => {
    try {
      return JSON.parse(card.tags || "[]");
    } catch {
      return [];
    }
  })();
  const due = card.dueDate ? new Date(card.dueDate) : null;
  const dueColor = due
    ? isPast(due) && !isToday(due)
      ? "text-destructive"
      : isToday(due)
      ? "text-amber-500"
      : "text-muted-foreground"
    : "text-muted-foreground";

  const priorityRing =
    card.priority === "high"
      ? "border-l-red-500"
      : card.priority === "medium"
      ? "border-l-amber-500"
      : "border-l-emerald-500";

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={`group cursor-pointer rounded-md border border-l-4 ${priorityRing} bg-card p-3 hover-elevate active-elevate-2 text-sm`}
      data-testid={`card-${card.id}`}
    >
      <div className="font-medium leading-snug">{card.title}</div>
      {card.description && (
        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{card.description}</div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 2).map((t) => (
            <Badge key={t} variant="outline" className="text-[10px] py-0 h-5">
              {t}
            </Badge>
          ))}
          {card.source !== "manual" && (
            <Badge variant="secondary" className="text-[10px] py-0 h-5">
              from {card.source}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {due && (
            <span className={`flex items-center gap-1 ${dueColor}`}>
              <Calendar className="h-3 w-3" />
              {format(due, "MMM d")}
            </span>
          )}
          {assignee && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
              {assignee.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ComposeCard({ onCancel, onCreate }: { onCancel: () => void; onCreate: (title: string) => void }) {
  const [title, setTitle] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onCreate(title.trim());
      }}
      className="rounded-md border bg-card p-2"
    >
      <textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Card title"
        className="w-full resize-none rounded-md bg-transparent text-sm focus:outline-none"
        rows={2}
        data-testid="input-new-card-title"
      />
      <div className="mt-1 flex items-center gap-1">
        <Button type="submit" size="sm" className="h-7 text-xs" data-testid="button-create-card">
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
