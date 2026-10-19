import type { ReactNode } from 'react';
import { Outlet, Link } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 50% at 20% 0%, color-mix(in srgb, var(--primary) 14%, transparent), transparent), radial-gradient(50% 40% at 90% 20%, color-mix(in srgb, var(--accent) 12%, transparent), transparent)',
        }}
      />
      <header className="flex items-center gap-2.5 px-6 h-16">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Aurevia home">
          <div
            className="flex items-center justify-center rounded-lg font-bold text-white"
            style={{ width: 32, height: 32, background: 'var(--primary)' }}
          >
            A
          </div>
          <span className="text-lg font-bold tracking-tight">Aurevia</span>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
      <footer className="py-6 text-center text-xs" style={{ color: 'var(--muted)' }}>
        © {new Date().getFullYear() - 1} Aurevia · Investment portfolio &amp; wealth management
      </footer>
    </div>
  );
}

export type { ReactNode };
