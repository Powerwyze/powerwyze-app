import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Phone, Sun, Moon, CheckCircle2, PhoneCall } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Call = {
  id: number;
  userId: number;
  kind: "standup" | "eod";
  status: string;
  scheduledFor: number;
  startedAt: number | null;
  endedAt: number | null;
  summary: string | null;
  mood: string | null;
  actionItemsCreated: number | null;
};

type Turn = { role: "agent" | "user"; content: string };

export default function CallsPage() {
  const { me } = useAuth();
  const { toast } = useToast();
  const [activeCallId, setActiveCallId] = useState<number | null>(null);
  const [activeKind, setActiveKind] = useState<"standup" | "eod">("standup");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const callsQ = useQuery<{ calls: Call[] }>({ queryKey: ["/api/calls"] });

  const dialMut = useMutation({
    mutationFn: async (kind: "standup" | "eod") => {
      const res = await apiRequest("POST", "/api/calls/dial", { kind });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Calling you now",
        description: `Twilio is dialing your phone. Pick up to talk to the agent. (Call ID ${data.callId})`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't place call",
        description: e.message,
        variant: "destructive",
      }),
  });

  const startMut = useMutation({
    mutationFn: async (kind: "standup" | "eod") => {
      const res = await apiRequest("POST", "/api/calls/start", { kind });
      return res.json() as Promise<{ call: Call }>;
    },
    onSuccess: async (data, kind) => {
      setActiveCallId(data.call.id);
      setActiveKind(kind);
      setTranscript([]);
      // Kick off opening turn
      const res = await apiRequest("POST", `/api/calls/${data.call.id}/turn`, { history: [] });
      const j = await res.json();
      setTranscript([{ role: "agent", content: j.reply }]);
    },
  });

  const turnMut = useMutation({
    mutationFn: async (history: Turn[]) => {
      const res = await apiRequest("POST", `/api/calls/${activeCallId}/turn`, { history });
      return res.json() as Promise<{ reply: string }>;
    },
    onSuccess: (data) => {
      setTranscript((t) => [...t, { role: "agent", content: data.reply }]);
    },
  });

  const endMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/calls/${activeCallId}/end`, { transcript });
      return res.json() as Promise<{ summary: string; mood: string | null; created: number }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Call ended",
        description: `${data.created} action item${data.created === 1 ? "" : "s"} added to your boards.`,
      });
      setActiveCallId(null);
      setTranscript([]);
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boards"] });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript, turnMut.isPending]);

  const onSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const next = [...transcript, { role: "user" as const, content: text }];
    setTranscript(next);
    setDraft("");
    turnMut.mutate(next);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Standup & EOD calls</h1>
          <p className="text-sm text-muted-foreground">
            In production, the agent calls you at your scheduled time. You can also start a call right now —
            we'll simulate the conversation in the browser, parse it, and create cards on the right boards.
          </p>
        </div>

        {!activeCallId ? (
          <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PhoneCall className="h-5 w-5 text-emerald-500" />
              <div>
                <div className="font-semibold text-sm">Call my real phone</div>
                <div className="text-xs text-muted-foreground">
                  Twilio will dial {me?.phone || "your phone"} and connect you to the ElevenLabs voice agent.
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => dialMut.mutate("standup")}
                disabled={dialMut.isPending || !me?.phone}
                data-testid="button-dial-standup"
              >
                Dial standup
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => dialMut.mutate("eod")}
                disabled={dialMut.isPending || !me?.phone}
                data-testid="button-dial-eod"
              >
                Dial EOD
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => startMut.mutate("standup")}
              disabled={startMut.isPending}
              className="rounded-lg border bg-card p-6 text-left hover-elevate active-elevate-2"
              data-testid="button-start-standup"
            >
              <Sun className="h-6 w-6 text-amber-500 mb-3" />
              <div className="font-semibold">Start standup now</div>
              <div className="text-sm text-muted-foreground mt-1">
                Briefs you on top items, asks what you'll work on, captures new projects.
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Scheduled daily at {me?.standupTime}
              </div>
            </button>

            <button
              onClick={() => startMut.mutate("eod")}
              disabled={startMut.isPending}
              className="rounded-lg border bg-card p-6 text-left hover-elevate active-elevate-2"
              data-testid="button-start-eod"
            >
              <Moon className="h-6 w-6 text-indigo-500 mb-3" />
              <div className="font-semibold">Start EOD now</div>
              <div className="text-sm text-muted-foreground mt-1">
                Asks what you finished, what's blocked, and what's rolling to tomorrow.
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Scheduled daily at {me?.eodTime}
              </div>
            </button>
          </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="font-medium">
                  {activeKind === "standup" ? "Standup call" : "End-of-day call"} — in progress
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => endMut.mutate()}
                disabled={endMut.isPending || transcript.length < 2}
                data-testid="button-end-call"
              >
                {endMut.isPending ? "Ending…" : "End call"}
              </Button>
            </div>
            <div ref={scrollRef} className="h-80 overflow-y-auto p-4 space-y-3">
              {transcript.map((t, i) => (
                <div
                  key={i}
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    t.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                  data-testid={`call-turn-${i}`}
                >
                  {t.content}
                </div>
              ))}
              {turnMut.isPending && (
                <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground w-fit">
                  …
                </div>
              )}
            </div>
            <form onSubmit={onSend} className="flex gap-2 border-t p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Reply to the agent…"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="input-call-reply"
              />
              <Button type="submit" disabled={turnMut.isPending}>Send</Button>
            </form>
          </div>
        )}

        <div>
          <h2 className="font-semibold mb-3">Recent calls</h2>
          <div className="space-y-2">
            {(callsQ.data?.calls || []).map((c) => (
              <div key={c.id} className="rounded-lg border bg-card p-4 text-sm" data-testid={`call-row-${c.id}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 font-medium">
                    {c.kind === "standup" ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
                    {c.kind === "standup" ? "Standup" : "EOD"}
                    <Badge variant={c.status === "completed" ? "default" : "secondary"}>{c.status}</Badge>
                    {(c.actionItemsCreated || 0) > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {c.actionItemsCreated} item
                        {c.actionItemsCreated === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(c.scheduledFor), "MMM d, h:mma")}
                  </span>
                </div>
                {c.summary && <p className="text-muted-foreground">{c.summary}</p>}
                {c.mood && <p className="mt-1 text-xs text-muted-foreground">Mood: {c.mood}</p>}
              </div>
            ))}
            {(callsQ.data?.calls || []).length === 0 && (
              <div className="text-sm text-muted-foreground">No calls yet — start a standup above.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
