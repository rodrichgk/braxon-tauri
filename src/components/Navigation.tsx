export type Page = "home" | "valves" | "motors" | "signal";

const TABS: { id: Page; label: string; icon: string; description: string }[] = [
  { id: "home",   label: "Home",           icon: "🏠", description: "Info & Configuration" },
  { id: "valves", label: "Valve Testing",   icon: "⚙️", description: "Hydraulic modulator valves" },
  { id: "motors", label: "Motor Testing",   icon: "🔧", description: "ABS block motor" },
  { id: "signal", label: "Signal Testing",  icon: "📡", description: "ABS ECU diagnostics" },
];

interface NavigationProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

export default function Navigation({ currentPage, onPageChange }: NavigationProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
      <div className="container mx-auto px-4">
        <div className="flex items-center">
          <div className="flex items-center gap-2 py-4 pr-8 border-r border-slate-200 dark:border-slate-700 mr-4">
            <span className="text-xl font-bold text-slate-900 dark:text-white">PIC ABS Tester</span>
          </div>
          <nav className="flex">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => onPageChange(tab.id)}
                className={[
                  "flex flex-col items-start px-5 py-3 border-b-2 transition-all text-sm font-medium",
                  currentPage === tab.id
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300"
                ].join(" ")}
              >
                <span className="flex items-center gap-1.5">
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </span>
                <span className="text-xs text-slate-400 mt-0.5 hidden sm:block">{tab.description}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
