use serde::{Deserialize, Serialize};
use serialport::{SerialPort, SerialPortInfo};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortData {
    pub port_name: String,
    pub port_type: String,
}

pub struct SerialConnection {
    port: Option<Box<dyn SerialPort>>,
}

impl SerialConnection {
    pub fn new() -> Self {
        Self { port: None }
    }

    pub fn list_ports() -> Result<Vec<SerialPortData>, String> {
        match serialport::available_ports() {
            Ok(ports) => {
                let port_list: Vec<SerialPortData> = ports
                    .iter()
                    .map(|p| SerialPortData {
                        port_name: p.port_name.clone(),
                        port_type: match &p.port_type {
                            serialport::SerialPortType::UsbPort(_) => "USB".to_string(),
                            serialport::SerialPortType::BluetoothPort => "Bluetooth".to_string(),
                            serialport::SerialPortType::PciPort => "PCI".to_string(),
                            serialport::SerialPortType::Unknown => "Unknown".to_string(),
                        },
                    })
                    .collect();
                Ok(port_list)
            }
            Err(e) => Err(format!("Failed to list serial ports: {}", e)),
        }
    }

    pub fn connect(&mut self, port_name: &str, baud_rate: u32) -> Result<(), String> {
        match serialport::new(port_name, baud_rate)
            .timeout(Duration::from_millis(1000))
            .open()
        {
            Ok(port) => {
                self.port = Some(port);
                Ok(())
            }
            Err(e) => Err(format!("Failed to open serial port: {}", e)),
        }
    }

    pub fn disconnect(&mut self) {
        self.port = None;
    }

    pub fn is_connected(&self) -> bool {
        self.port.is_some()
    }

    pub fn write(&mut self, data: &[u8]) -> Result<usize, String> {
        match &mut self.port {
            Some(port) => port
                .write(data)
                .map_err(|e| format!("Failed to write to serial port: {}", e)),
            None => Err("Serial port not connected".to_string()),
        }
    }

    pub fn read(&mut self, buffer: &mut [u8]) -> Result<usize, String> {
        match &mut self.port {
            Some(port) => port
                .read(buffer)
                .map_err(|e| format!("Failed to read from serial port: {}", e)),
            None => Err("Serial port not connected".to_string()),
        }
    }
}

pub type SharedSerialConnection = Arc<Mutex<SerialConnection>>;

pub fn create_serial_connection() -> SharedSerialConnection {
    Arc::new(Mutex::new(SerialConnection::new()))
}
