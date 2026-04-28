import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";

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
};
type SafeUser = { id: number; name: string; email: string };
type Column = { id: number; name: string };
type Comment = { id: number; cardId: number; authorId: number; body: string; createdAt: number };

export function CardDialog({
  card,
  users,
  columns,
  onClose,
  slug,
}: {
  card: Card;
  users: SafeUser[];
  columns: Column[];
  onClose: () => void;
  slug: string;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || "");
  const [priority, setPriority] = useState(card.priority);
  const [columnId, setColumnId] = useState(String(card.columnId));
  const [assigneeId, setAssigneeId] = useState(card.assigneeId ? String(card.assigneeId) : "none");
  const [dueDate, setDueDate] = useState(
    card.dueDate ? format(new Date(card.dueDate), "yyyy-MM-dd") : "",
  );
  const [newComment, setNewComment] = useState("");

  const commentsQ = useQuery<{ comments: Comment[] }>({
    queryKey: ["/api/cards", card.id, "comments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/cards/${card.id}/comments`);
      return res.json();
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/cards/${card.id}`, {
        title,
        description: description || null,
        priority,
        columnId: parseInt(columnId, 10),
        assigneeId: assigneeId === "none" ? null : parseInt(assigneeId, 10),
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boards", slug] });
      onClose();
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/cards/${card.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boards", slug] });
      onClose();
    },
  });

  const commentMut = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/cards/${card.id}/comments`, { body });
      return res.json();
    },
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/cards", card.id, "comments"] });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit card</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-card-title" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              data-testid="input-card-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Column</Label>
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger data-testid="select-card-column">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger data-testid="select-card-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger data-testid="select-card-assignee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="input-card-due"
              />
            </div>
          </div>

          <div className="border-t pt-3">
            <Label className="text-sm">Comments</Label>
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {(commentsQ.data?.comments || []).map((c) => {
                const author = users.find((u) => u.id === c.authorId);
                return (
                  <div key={c.id} className="rounded-md bg-muted px-3 py-2 text-sm">
                    <div className="text-xs text-muted-foreground mb-1">
                      {author?.name || "Unknown"} · {format(new Date(c.createdAt), "MMM d, h:mma")}
                    </div>
                    <div>{c.body}</div>
                  </div>
                );
              })}
              {(commentsQ.data?.comments || []).length === 0 && (
                <div className="text-xs text-muted-foreground">No comments yet.</div>
              )}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newComment.trim()) commentMut.mutate(newComment.trim());
              }}
            >
              <Input
                placeholder="Add a comment…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                data-testid="input-comment"
              />
              <Button type="submit" size="sm" disabled={!newComment.trim() || commentMut.isPending}>
                Post
              </Button>
            </form>
          </div>

          <div className="flex justify-between border-t pt-4">
            <Button
              variant="outline"
              onClick={() => deleteMut.mutate()}
              className="text-destructive hover:text-destructive"
              data-testid="button-delete-card"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} data-testid="button-save-card">
                {saveMut.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
