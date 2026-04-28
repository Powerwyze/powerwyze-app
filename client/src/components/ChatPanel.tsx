import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Send, Sparkles } from "lucide-react";

type Msg = { role: "user" | "agent"; content: string };

export function ChatPanel({ boardSlug, boardName }: { boardSlug: string; boardName: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "agent",
      content: `Hi — I'm the agent for the "${boardName}" board. Ask me anything about it: priorities, blockers, what's due, who's assigned what.`,
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", `/api/boards/${boardSlug}/chat`, { message: text });
      return res.json() as Promise<{ reply: string }>;
    },
    onSuccess: (data) => {
      setMessages((m) => [...m, { role: "agent", content: data.reply }]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, send.isPending]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    send.mutate(text);
  };

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="font-medium text-sm">Board agent</div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
            data-testid={`chat-msg-${i}`}
          >
            <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
          </div>
        ))}
        {send.isPending && (
          <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground w-fit">
            Thinking…
          </div>
        )}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this board…"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          data-testid="input-chat"
        />
        <Button type="submit" size="icon" disabled={send.isPending} data-testid="button-chat-send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </aside>
  );
}
