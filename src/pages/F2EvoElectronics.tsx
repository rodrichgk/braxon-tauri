import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ElectronicsBenchDashboard from '@/components/ElectronicsBenchDashboard';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';

export default function F2EvoElectronicsPage() {
  const { t } = useTranslation();
  const { isConnected, isReconnecting } = useClientSerialConnection();

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          {t('f2evo.abs_bench.page_title')}
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {t('f2evo.abs_bench.page_subtitle')}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      >
        <ElectronicsBenchDashboard isConnected={isConnected} isReconnecting={isReconnecting} />
      </motion.div>
    </div>
  );
}
