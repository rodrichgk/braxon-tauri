import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ClusterBenchDashboard from '@/components/ClusterBenchDashboard';
import PsaActiveTestPanel from '@/components/PsaActiveTestPanel';

export default function ClusterBenchPage() {
  const { t } = useTranslation();
  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          {t('cluster_bench.title', { defaultValue: 'Cluster Bench' })}
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {t('cluster_bench.subtitle', { defaultValue: 'Virtual BSI — CAN signal generator for instrument clusters' })}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="mb-6 space-y-6"
      >
        <ClusterBenchDashboard />
        <PsaActiveTestPanel />
      </motion.div>
    </div>
  );
}
