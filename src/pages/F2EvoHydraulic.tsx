import { motion } from 'framer-motion';
import HydraulicBenchDashboard from '@/components/HydraulicBenchDashboard';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';

export default function F2EvoHydraulicPage() {
  // Bench Report finding: only isConnected was ever passed down, so the
  // dashboard couldn't tell a brief, self-healing reconnect apart from a
  // real disconnect — see HydraulicBenchDashboard's own doc comment.
  const { isConnected, isReconnecting, reconnectAttempt } = useClientSerialConnection();

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          F2-EVO Hydraulic
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Hydraulic bench diagnostics and manual controls
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="mb-6"
      >
        <HydraulicBenchDashboard isConnected={isConnected} isReconnecting={isReconnecting} reconnectAttempt={reconnectAttempt} />
      </motion.div>
    </div>
  );
}
