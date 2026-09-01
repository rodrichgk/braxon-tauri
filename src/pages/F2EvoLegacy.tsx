import { motion } from 'framer-motion';
import F2EvoLegacyPanel, { type BoardId } from '@/components/F2EvoLegacyPanel';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';

export default function F2EvoLegacyPage({ board, title, subtitle }: { board: BoardId; title: string; subtitle: string }) {
  const { isConnected } = useClientSerialConnection();

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {subtitle}
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
        <F2EvoLegacyPanel isConnected={isConnected} board={board} />
      </motion.div>
    </div>
  );
}
