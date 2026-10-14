import { ReactNode } from "react";
import { Header } from "./Header";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
