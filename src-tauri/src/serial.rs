use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortData {
    pub port_name: String,
    pub port_type: String,
}

/// Owns the mpsc Sender to the background worker thread.
/// The worker thread owns the actual SerialPort — no try_clone needed.
pub struct SerialConnection {
    tx_sender: Option<Sender<String>>,
    stop_flag: Arc<AtomicBool>,
}

impl SerialConnection {
    pub fn new() -> Self {
        Self {
            tx_sender: None,
            stop_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn list_ports() -> Result<Vec<SerialPortData>, String> {
        match serialport::available_ports() {
            Ok(ports) => {
                let port_list = ports
                    .iter()
                    .map(|p| SerialPortData {
                        port_name: p.port_name.clone(),
                        port_type: match &p.port_type {
                            serialport::SerialPortType::UsbPort(info) => {
                                format!("USB VID:{:04x} PID:{:04x}", info.vid, info.pid)
                            }
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

    /// Opens the port and returns (port, rx_channel) for the caller to hand
    /// to the worker thread. Stores the tx end so send_message() works.
    pub fn connect(
        &mut self,
        port_name: &str,
        baud_rate: u32,
    ) -> Result<(Box<dyn serialport::SerialPort>, mpsc::Receiver<String>), String> {
        self.stop_flag.store(false, Ordering::SeqCst);

        let mut port = serialport::new(port_name, baud_rate)
            .timeout(Duration::from_millis(10))
            .open()
            .map_err(|e| format!("Failed to open {}: {}", port_name, e))?;

        let _ = port.write_data_terminal_ready(true);

        let (tx, rx) = mpsc::channel::<String>();
        self.tx_sender = Some(tx);

        Ok((port, rx))
    }

    pub fn disconnect(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        self.tx_sender = None; // dropping the Sender closes the channel → worker exits
    }

    pub fn is_connected(&self) -> bool {
        self.tx_sender.is_some()
    }

    pub fn stop_flag(&self) -> Arc<AtomicBool> {
        self.stop_flag.clone()
    }

    pub fn send_message(&self, message: String) -> Result<(), String> {
        match &self.tx_sender {
            Some(tx) => tx
                .send(message)
                .map_err(|_| "Serial port not connected".to_string()),
            None => Err("Serial port not connected".to_string()),
        }
    }
}

pub type SharedSerialConnection = Arc<Mutex<SerialConnection>>;

pub fn create_serial_connection() -> SharedSerialConnection {
    Arc::new(Mutex::new(SerialConnection::new()))
}
