import { useState, useEffect } from 'react';

export interface ConnectedDevice {
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

export interface WebSocketMessage {
  type: 'sensor_data' | 'wheel_speeds' | 'status' | 'error' | 'heartbeat' | 'valve_status' | 'raw_message' | 'device_list' | 'device_selected' | 'select_device' | 'connection_rejected';
  data?: any;
  message?: string;
  timestamp?: number;
  // Valve-specific properties
  valveId?: number;
  status?: string;
  health?: number;
  // Device management properties
  devices?: ConnectedDevice[];
  selectedDeviceId?: string | null;
  deviceId?: string | null;
  isConnected?: boolean;
  // Connection rejection properties
  reason?: string;
  deviceName?: string;
}

export function useWebSocketConnection() {
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isConnectedToDevice, setIsConnectedToDevice] = useState(false);

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    const connectWebSocket = () => {
      // Get WebSocket URL based on environment - use nginx proxy on port 8443
      const wsHost = process.env.NEXT_PUBLIC_WS_HOST || window.location.hostname;
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsPort = window.location.port || '8443'; // Use 8443 for nginx SSL proxy
      const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}/ws`;

      console.log('[useWebSocketConnection] Attempting WebSocket connection to:', wsUrl);
      
      // Close existing connection if any
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        console.log('[useWebSocketConnection] Closing existing connection before reconnecting');
        socket.close();
      }
      
      try {
        const ws = new WebSocket(wsUrl);
        
        console.log('[useWebSocketConnection] WebSocket object created');
        
        ws.onopen = () => {
          console.log('[useWebSocketConnection] WebSocket connected successfully to', wsUrl);
          setIsConnected(true);
          setErrorMessage(null);
          retryCount = 0; // Reset retry count on successful connection
          
          // Request device list immediately after connection
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              const requestDeviceList = {
                type: 'request_device_list',
                timestamp: Date.now()
              };
              ws.send(JSON.stringify(requestDeviceList));
              console.log('[useWebSocketConnection] Requested device list after connection');
            }
          }, 500);
        };

        ws.onmessage = (event) => {
          console.log('[useWebSocketConnection] Raw WebSocket message received:', event.data);
          
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            console.log('[useWebSocketConnection] Parsed WebSocket message:', message);
            
            // Handle different message types
            if (message.type === 'error') {
              console.error('[useWebSocketConnection] Received error message:', message.message);
              setErrorMessage(message.message || 'Unknown error occurred');
            } else if (message.type === 'device_list') {
              console.log('[useWebSocketConnection] Received device list:', message.devices);
              console.log('[useWebSocketConnection] ESP32 devices found:', message.devices?.filter(d => d.type === 'esp32'));
              if (message.devices) {
                setDevices(message.devices);
              }
            } else if (message.type === 'device_selected') {
              console.log('[useWebSocketConnection] Device selected:', message.selectedDeviceId);
              setSelectedDeviceId(message.selectedDeviceId || null);
              setIsConnectedToDevice(message.isConnected || false);
            } else if (message.type === 'connection_rejected') {
              console.warn('[useWebSocketConnection] Connection rejected:', message.reason);
              const deviceName = message.deviceName || 'Unknown device';
              setErrorMessage(`Connection to ${deviceName} rejected: ${message.reason}`);
              // Reset connection state
              setSelectedDeviceId(null);
              setIsConnectedToDevice(false);
            }
          } catch (error) {
            console.error('[useWebSocketConnection] Error parsing WebSocket message:', error, 'Raw message:', event.data);
          }
        };

        ws.onclose = (event) => {
          console.log('[useWebSocketConnection] WebSocket disconnected with code:', event.code, 'reason:', event.reason);
          setIsConnected(false);
          setIsConnectedToDevice(false);
          setSelectedDeviceId(null);
          
          // Retry connection if we haven't exceeded max retries
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`[useWebSocketConnection] Retrying connection (${retryCount}/${maxRetries})...`);
            setTimeout(connectWebSocket, retryDelay);
          } else {
            console.log('[useWebSocketConnection] Max retries exceeded');
            setErrorMessage('Failed to establish WebSocket connection after multiple attempts');
          }
        };

        ws.onerror = (error) => {
          console.error('[useWebSocketConnection] WebSocket error:', error);
          setErrorMessage('WebSocket connection error');
        };

        setSocket(ws);
      } catch (error) {
        console.error('[useWebSocketConnection] Error creating WebSocket:', error);
        setErrorMessage('Failed to create WebSocket connection');
      }
    };

    // Start connection attempt
    connectWebSocket();

    return () => {
      console.log('[useWebSocketConnection] Cleaning up WebSocket connection');
      if (socket) {
        socket.close();
      }
    };
  }, []);

  const sendMessage = (message: WebSocketMessage): boolean => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
        console.log('[useWebSocketConnection] Message sent:', message);
        return true;
      } catch (error) {
        console.error('[useWebSocketConnection] Error sending message:', error);
        setErrorMessage('Failed to send WebSocket message');
        return false;
      }
    } else {
      console.warn('[useWebSocketConnection] Cannot send message - WebSocket not connected');
      setErrorMessage('WebSocket not connected');
      return false;
    }
  };

  const selectDevice = (deviceId: string | null): boolean => {
    const message = {
      type: 'select_device' as const,
      deviceId: deviceId
    };
    
    if (sendMessage(message)) {
      setSelectedDeviceId(deviceId);
      return true;
    }
    return false;
  };

  return {
    isConnected,
    socket,
    errorMessage,
    setErrorMessage,
    sendMessage,
    devices,
    selectedDeviceId,
    selectDevice,
    isConnectedToDevice
  };
}
