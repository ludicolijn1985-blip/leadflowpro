export default function AuthLayout({ title, subtitle, children }) {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">Leadflow Pro</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-slate-300">{subtitle}</p>
        <div className="mt-8 space-y-4">{children}</div>
      </section>
    </main>
  );
}