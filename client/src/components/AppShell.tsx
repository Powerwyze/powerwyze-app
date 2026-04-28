import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { LogOut, User as UserIcon, Phone, Building2, Lock, Briefcase } from "lucide-react";

type Board = {
  id: number;
  name: string;
  slug: string;
  kind: "personal" | "business" | "company";
  ownerId: number | null;
};

export function AppShell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const [location] = useLocation();
  const { data } = useQuery<{ boards: Board[] }>({ queryKey: ["/api/boards"] });

  const boards = data?.boards || [];
  const personal = boards.filter((b) => b.kind === "personal");
  const business = boards.filter((b) => b.kind === "business");
  const company = boards.filter((b) => b.kind === "company");

  const navItem = (href: string, label: string, icon?: ReactNode) => {
    const active = location === href;
    return (
      <Link key={href} href={href}>
        <a
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover-elevate ${
            active ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
          }`}
          data-testid={`nav-${href.replace(/\//g, "-")}`}
        >
          {icon}
          <span className="truncate">{label}</span>
        </a>
      </Link>
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
          <Logo />
          <div>
            <div className="text-sm font-semibold">PowerWyze</div>
            <div className="text-xs text-muted-foreground">Operating System</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          <div>
            <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Company
            </div>
            {company.map((b) => navItem(`/board/${b.slug}`, b.name, <Building2 className="h-4 w-4" />))}
          </div>

          <div>
            <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Business
            </div>
            {business.map((b) => navItem(`/board/${b.slug}`, b.name, <Briefcase className="h-4 w-4" />))}
          </div>

          <div>
            <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Personal
            </div>
            {personal.map((b) => navItem(`/board/${b.slug}`, b.name, <Lock className="h-4 w-4" />))}
          </div>

          <div className="pt-2 border-t border-sidebar-border">
            {navItem("/calls", "Calls", <Phone className="h-4 w-4" />)}
            {navItem("/profile", "Profile", <UserIcon className="h-4 w-4" />)}
          </div>
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 text-xs">
            <div className="font-medium" data-testid="text-username">{me?.name}</div>
            <div className="text-muted-foreground truncate">{me?.email}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
