import { cn } from "@/lib/utils";

/** The glass card used for each section (from the App.jsx prototype). */
export function Panel({ padded = false, children }: { padded?: boolean; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-800/60 shadow-2xl backdrop-blur-md",
        padded && "space-y-6 p-6",
      )}
    >
      {children}
    </section>
  );
}

/** Header bar for panels whose content runs edge to edge (tables). */
export function PanelBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/60 bg-slate-800/80 p-4">
      {children}
    </div>
  );
}

export function PanelHeading({
  title,
  description,
  icon,
  size = "md",
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <div>
      <h2
        className={cn(
          "flex items-center gap-2 text-white",
          size === "lg" ? "text-xl font-bold" : "text-lg font-semibold",
        )}
      >
        {icon}
        {title}
      </h2>
      {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
    </div>
  );
}
