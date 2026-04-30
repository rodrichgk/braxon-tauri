import { MotorTester } from '../components/MotorTester';

export default function MotorsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold mb-6 text-gray-800 dark:text-white text-center">
        Motor Testing
      </h1>
      <MotorTester />
    </div>
  );
}
