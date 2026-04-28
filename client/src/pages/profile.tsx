import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { me } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [standupTime, setStandupTime] = useState("09:00");
  const [eodTime, setEodTime] = useState("17:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (me) {
      setName(me.name);
      setPhone(me.phone || "");
      setStandupTime(me.standupTime || "09:00");
      setEodTime(me.eodTime || "17:00");
      setTimezone(me.timezone || "America/New_York");
    }
  }, [me]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/profile", {
        name,
        phone,
        standupTime,
        eodTime,
        timezone,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Profile updated" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const passwordMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/profile/password", { currentPassword, newPassword });
      return res.json();
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      toast({ title: "Password changed" });
    },
    onError: (e: any) =>
      toast({ title: "Password change failed", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-8">
        <div>
          <h1 className="text-xl font-semibold">Profile</h1>
          <p className="text-sm text-muted-foreground">
            Manage your details, call schedule, and password.
          </p>
        </div>

        <section className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">Account</h2>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={me?.email || ""} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone (E.164 — Twilio will dial this)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+18577076043"
              data-testid="input-phone"
            />
          </div>
        </section>

        <section className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">Call schedule</h2>
          <p className="text-xs text-muted-foreground">
            The voice agent calls you at these times, daily. Standup briefs you on what's on your boards;
            EOD asks what you finished and rolls items forward.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="standup">Standup call time</Label>
              <Input
                id="standup"
                type="time"
                value={standupTime}
                onChange={(e) => setStandupTime(e.target.value)}
                data-testid="input-standup-time"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eod">End-of-day call time</Label>
              <Input
                id="eod"
                type="time"
                value={eodTime}
                onChange={(e) => setEodTime(e.target.value)}
                data-testid="input-eod-time"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tz">Timezone</Label>
            <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} data-testid="input-timezone" />
          </div>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} data-testid="button-save-profile">
            {saveMut.isPending ? "Saving…" : "Save changes"}
          </Button>
        </section>

        <section className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">Change password</h2>
          <div className="space-y-2">
            <Label htmlFor="cur">Current password</Label>
            <Input
              id="cur"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              data-testid="input-current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new">New password (min 8 chars)</Label>
            <Input
              id="new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              data-testid="input-new-password"
            />
          </div>
          <Button
            onClick={() => passwordMut.mutate()}
            disabled={passwordMut.isPending || !currentPassword || newPassword.length < 8}
            data-testid="button-change-password"
          >
            {passwordMut.isPending ? "Changing…" : "Change password"}
          </Button>
        </section>
      </div>
    </AppShell>
  );
}
