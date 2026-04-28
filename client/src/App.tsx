import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import Login from "@/pages/login";
import Home from "@/pages/home";
import Board from "@/pages/board";
import Profile from "@/pages/profile";
import Calls from "@/pages/calls";
import NotFound from "@/pages/not-found";

function AppRouter() {
  const { me, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (!me) return <Login />;
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/board/:slug" component={Board} />
      <Route path="/profile" component={Profile} />
      <Route path="/calls" component={Calls} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
