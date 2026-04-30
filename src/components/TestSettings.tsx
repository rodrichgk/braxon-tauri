"use client";

import { useState, useEffect } from 'react';
import {
  InformationCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

interface TestSettingsProps {
  result: {
    manufacturer: string;
    wssType: string;
    kLine: string;
    absAdapter: string;
    absConnector: string;
    testValid: boolean;
    testInfo: string;
  };
}

export default function TestSettings({ result }: TestSettingsProps) {
  const [testInfo, setTestInfo] = useState(result.testInfo);

  useEffect(() => {
    setTestInfo(result.testInfo);
  }, [result.testInfo]);

  return (
    <div className="card">
      <h2 className="card-header text-2xl flex items-center jakarta-heading">
        <InformationCircleIcon className="h-6 w-6 mr-2 text-blue-600" />
        Test Settings
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {[
          { label: 'Manufacturer', value: result.manufacturer },
          { label: 'WSS Type', value: result.wssType },
          { label: 'K-Line', value: result.kLine },
          {
            label: 'Test Valid',
            value: result.testValid ? 'Yes' : 'No',
            icon: result.testValid ? (
              <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
            ) : (
              <XCircleIcon className="h-5 w-5 text-red-500 mr-2" />
            ),
            valueClass: result.testValid
              ? 'status-success'
              : 'status-error',
          },
          { label: 'ABS Adapter', value: result.absAdapter || 'N/A' },
          { label: 'ABS Connector', value: result.absConnector || 'N/A' },
        ].map((field, idx) => (
          <div key={idx}>
            <label className="input-label text-sm mb-1">
              {field.label}
            </label>
            <div className="mt-1 flex items-center text-gray-900 dark:text-white font-medium">
              {field.icon}
              <span className={field.valueClass || ''}>
                {field.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <label className="input-label text-sm mb-1">
          Test Info
        </label>
        <textarea
          value={testInfo}
          onChange={(e) => setTestInfo(e.target.value)}
          rows={4}
          placeholder="Add test notes and information here..."
          className="input-field mt-1 w-full"
        />
      </div>
    </div>
  );
}
