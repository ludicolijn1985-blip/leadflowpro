export default function DashboardLayout({ user, onLogout, children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Leadflow Pro</p>
            <p className="text-sm text-slate-300">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}