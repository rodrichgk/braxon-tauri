"use client";

import React, { useState, useEffect } from 'react';
import {
  WifiIcon,
  DevicePhoneMobileIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';

interface ConnectedDevice {
  id: string;
  type: 'esp32' | 'browser';
  serialNumber?: string;
  deviceName?: string;
  ipAddress?: string;
  connectedAt: string;
  lastSeen: string;
  isSelected?: boolean;  // Whether this device is paired with the current client
  isPaired?: boolean;    // Whether this ESP32 is paired with any client
}

interface DeviceSelectorProps {
  devices: ConnectedDevice[];
  selectedDeviceId: string | null;
  onDeviceSelect: (deviceId: string | null) => void;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
}

export default function DeviceSelector({
  devices,
  selectedDeviceId,
  onDeviceSelect,
  connectionStatus,
}: DeviceSelectorProps) {
  const [showDeviceList, setShowDeviceList] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every 5 seconds for real-time connection health display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const esp32Devices = devices.filter(device => device.type === 'esp32');
  const selectedDevice = devices.find(device => device.isSelected);

  const getDeviceStatus = (device: ConnectedDevice) => {
    if (device.isSelected) {
      return { status: 'selected', icon: <CheckCircleIcon className="h-4 w-4 text-blue-600" />, color: 'text-blue-600' };
    } else if (device.isPaired) {
      return { status: 'paired', icon: <LockClosedIcon className="h-4 w-4 text-red-600" />, color: 'text-red-600' };
    } else {
      return { status: 'available', icon: null, color: 'text-gray-600' };
    }
  };

  const handleDeviceClick = (device: ConnectedDevice) => {
    if (device.isPaired && !device.isSelected) {
      // Device is paired with another client, show warning but don't prevent click
      // The server will handle the rejection
      console.warn(`Device ${device.deviceName} is already paired with another client`);
    }
    onDeviceSelect(device.id);
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case 'connecting':
        return <ClockIcon className="h-5 w-5 text-amber-600 animate-spin" />;
      case 'disconnected':
        return <XCircleIcon className="h-5 w-5 text-red-600" />;
      default:
        return <XCircleIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getConnectionHealth = (device: ConnectedDevice) => {
    const now = new Date();
    const lastSeen = new Date(device.lastSeen);
    const timeSinceLastSeen = now.getTime() - lastSeen.getTime();
    
    if (timeSinceLastSeen < 10000) { // Less than 10 seconds
      return { status: 'healthy', color: 'text-green-600', indicator: '●' };
    } else if (timeSinceLastSeen < 30000) { // Less than 30 seconds
      return { status: 'warning', color: 'text-yellow-600', indicator: '●' };
    } else {
      return { status: 'stale', color: 'text-red-600', indicator: '●' };
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <WifiIcon className="h-6 w-6 text-blue-600" />
          <h3 className="card-header">WebSocket Devices</h3>
          {getConnectionIcon()}
        </div>
        <div className="text-sm text-gray-500">
          {esp32Devices.length} ESP32 device{esp32Devices.length !== 1 ? 's' : ''} connected
        </div>
      </div>

      {/* Connection Status */}
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Connection Status:</span>
          <span className={`text-sm font-medium ${
            connectionStatus === 'connected' ? 'status-success' :
            connectionStatus === 'connecting' ? 'status-warning' :
            'status-error'
          }`}>
            {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
          </span>
        </div>
      </div>

      {/* Selected Device */}
      {selectedDevice && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <DevicePhoneMobileIcon className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  Selected: {selectedDevice.deviceName || 'Unknown Device'}
                </span>
              </div>
              {selectedDevice.serialNumber && (
                <div className="text-xs text-blue-700 mt-1">
                  Serial: {selectedDevice.serialNumber}
                </div>
              )}
            </div>
            <button
              onClick={() => onDeviceSelect(null)}
              className="text-xs btn-link"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Device List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700">Available ESP32 Devices:</h4>
          <button
            onClick={() => setShowDeviceList(!showDeviceList)}
            className="text-xs btn-link"
          >
            {showDeviceList ? 'Hide' : 'Show'} Details
          </button>
        </div>

        {esp32Devices.length === 0 ? (
          <div className="text-sm text-gray-500 italic p-3 bg-gray-50 rounded-md">
            No ESP32 devices connected. Make sure your device is powered on and connected to the network.
          </div>
        ) : (
          <div className="space-y-2">
            {esp32Devices.map((device) => {
              const deviceStatus = getDeviceStatus(device);
              const connectionHealth = getConnectionHealth(device);
              const isClickable = !device.isPaired || device.isSelected;
              
              return (
                <div
                  key={device.id}
                  className={`p-3 border rounded-md transition-colors ${
                    device.isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : device.isPaired
                      ? 'border-red-200 bg-red-50 cursor-not-allowed opacity-75'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                  }`}
                  onClick={() => isClickable && handleDeviceClick(device)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <DevicePhoneMobileIcon className={`h-4 w-4 ${deviceStatus.color}`} />
                      <span className={`text-sm font-medium ${deviceStatus.color}`}>
                        {device.deviceName || 'ESP32 Device'}
                      </span>
                      {deviceStatus.icon}
                      <span className={`text-xs ${connectionHealth.color}`} title={`Connection health: ${connectionHealth.status}`}>
                        {connectionHealth.indicator}
                      </span>
                      {device.isPaired && !device.isSelected && (
                        <span className="text-xs text-red-600 font-medium">
                          (In Use)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(device.lastSeen)}
                      </span>
                      <span className={`text-xs ${connectionHealth.color}`}>
                        {connectionHealth.status}
                      </span>
                    </div>
                  </div>
                
                {showDeviceList && (
                  <div className="mt-2 text-xs text-gray-600 space-y-1">
                    {device.serialNumber && (
                      <div>Serial: {device.serialNumber}</div>
                    )}
                    {device.ipAddress && (
                      <div>IP: {device.ipAddress}</div>
                    )}
                    <div>Connected: {formatTimestamp(device.connectedAt)}</div>
                    <div className="flex items-center space-x-2">
                      <span>Status:</span>
                      <span className={`font-medium ${
                        device.isSelected ? 'text-blue-600' :
                        device.isPaired ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {device.isSelected ? 'Connected to you' :
                         device.isPaired ? 'Connected to another client' : 'Available'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )})}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <button
            onClick={() => onDeviceSelect(null)}
            disabled={!selectedDevice}
            className="flex-1 px-3 py-2 text-xs btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Disconnect All
          </button>
          {(() => {
            const availableDevices = esp32Devices.filter(device => !device.isPaired);
            return availableDevices.length > 0 && !selectedDevice && (
              <button
                onClick={() => onDeviceSelect(availableDevices[0].id)}
                className="flex-1 px-3 py-2 text-xs btn-primary"
              >
                Connect to First Available
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
