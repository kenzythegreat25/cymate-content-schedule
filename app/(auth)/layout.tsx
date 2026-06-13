import { ThemeChip } from "./ThemeChip";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen md:grid-cols-2">
      <div className="absolute right-4 top-4 z-10">
        <ThemeChip />
      </div>

      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-canvas md:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas text-ink">
            <span className="text-[11px] font-semibold tracking-tight">CS</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Cymate</div>
            <div className="text-[11px] text-canvas/60">Content Studio</div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -left-8 -top-32 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
          <div className="absolute -right-12 top-12 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
          <blockquote className="serif relative text-4xl leading-tight tracking-tight">
            One workspace for every post — from <em>raw idea</em> to performance <em>lookback</em>.
          </blockquote>
          <p className="relative mt-6 max-w-md text-sm text-canvas/60">
            Plan, schedule and review what goes out on every channel. Built for teams who treat content like product.
          </p>
        </div>

        <div className="relative flex items-center gap-3 text-xs text-canvas/40">
          <span>© Cymate</span>
          <span>·</span>
          <span>Content Studio v1</span>
        </div>
      </div>

      <div className="flex items-center justify-center bg-canvas px-6 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
