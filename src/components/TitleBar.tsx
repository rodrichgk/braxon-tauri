import { appWindow } from '@tauri-apps/api/window';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { LogoSymbol, LogoName } from './Logo';

function TrafficLight({
  color,
  hoverSymbol,
  onClick,
}: {
  color: string;
  hoverSymbol: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-3 h-3 rounded-full flex items-center justify-center group transition-all active:scale-90"
      style={{ backgroundColor: color }}
    >
      <span className="opacity-0 group-hover:opacity-60 text-[7px] font-black leading-none text-black select-none">
        {hoverSymbol}
      </span>
    </button>
  );
}

export default function TitleBar() {
  const { theme, toggle } = useTheme();

  return (
    <div className="flex h-[52px] shrink-0 select-none">

      {/* ── Left: sidebar-width zone (logo only) ── */}
      <div
        data-tauri-drag-region
        className="w-[220px] shrink-0 flex items-center gap-3 px-4
          bg-sidebar border-b border-r border-sidebar-border"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <LogoSymbol className="h-6 w-auto text-text-primary shrink-0" />
          <LogoName className="h-3.5 w-auto text-text-primary shrink-0" />
        </div>
      </div>

      {/* ── Right: drag region + theme toggle + traffic lights ── */}
      <div
        data-tauri-drag-region
        onDoubleClick={() => appWindow.toggleMaximize()}
        className="flex-1 flex items-center justify-end gap-2 px-3
          bg-app border-b border-sidebar-border"
      >
        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary
            hover:bg-text-tertiary/10 transition-all duration-150"
          style={{ pointerEvents: 'auto' }}
        >
          <motion.div
            key={theme}
            initial={{ rotate: -30, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {theme === 'dark'
              ? <SunIcon className="w-4 h-4" />
              : <MoonIcon className="w-4 h-4" />
            }
          </motion.div>
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-sidebar-border" />

        {/* Traffic lights — right side */}
        <div className="flex items-center gap-[6px]">
          <TrafficLight color="#febc2e" hoverSymbol="−" onClick={() => appWindow.minimize()} />
          <TrafficLight color="#28c840" hoverSymbol="+" onClick={() => appWindow.toggleMaximize()} />
          <TrafficLight color="#ff5f57" hoverSymbol="×" onClick={() => appWindow.close()} />
        </div>
      </div>
    </div>
  );
}
