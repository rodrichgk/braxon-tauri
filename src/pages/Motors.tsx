import { motion } from 'framer-motion';
import { MotorTester } from '../components/MotorTester';

// Bench Report finding: this page's header broke the pattern its two
// immediate sidebar neighbors (Valves.tsx, Signal.tsx) both use — centered,
// no subtitle, no entrance animation, versus their left-aligned title +
// subtitle + fade/slide-in. Brought in line; MotorTester itself is
// untouched.
export default function MotorsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          Motor Testing
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Run and monitor motor diagnostics on the connected bench
        </p>
      </motion.div>
      <MotorTester />
    </div>
  );
}
