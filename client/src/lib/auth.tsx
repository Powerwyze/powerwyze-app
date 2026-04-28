import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "./queryClient";

export type Me = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  standupTime: string;
  eodTime: string;
  timezone: string;
};

type AuthCtx = {
  me: Me | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const meQuery = useQuery<{ user: Me } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/auth/me");
        return await res.json();
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const loginMut = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  return (
    <Ctx.Provider
      value={{
        me: meQuery.data?.user || null,
        isLoading: meQuery.isLoading,
        login: async (email, password) => {
          await loginMut.mutateAsync({ email, password });
        },
        logout: async () => {
          await logoutMut.mutateAsync();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
