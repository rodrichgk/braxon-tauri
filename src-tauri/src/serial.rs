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

    pub fn find_pico_port() -> Option<String> {
        serialport::available_ports()
            .ok()?
            .into_iter()
            .find(|p| matches!(&p.port_type,
                serialport::SerialPortType::UsbPort(info) if info.vid == 0x2E8A
            ))
            .map(|p| p.port_name)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    #[test]
    fn a_fresh_connection_is_not_connected_and_refuses_to_send() {
        let mut c = SerialConnection::new();
        assert!(!c.is_connected());
        assert_eq!(c.send_message("PING".into()), Err("Serial port not connected".to_string()));

        // disconnect() on an already-idle connection is harmless and raises the stop flag
        c.disconnect();
        assert!(!c.is_connected());
        assert!(c.stop_flag().load(Ordering::SeqCst));
    }

    #[test]
    fn stop_flag_is_shared_state() {
        let c = SerialConnection::new();
        let a = c.stop_flag();
        let b = c.stop_flag();
        a.store(true, Ordering::SeqCst);
        assert!(b.load(Ordering::SeqCst));
    }

    #[test]
    fn serial_port_data_round_trips_through_json() {
        let d = SerialPortData { port_name: "COM7".into(), port_type: "USB VID:2e8a PID:0005".into() };
        let back: SerialPortData = serde_json::from_str(&serde_json::to_string(&d).unwrap()).unwrap();
        assert_eq!(back.port_name, "COM7");
        assert_eq!(back.port_type, "USB VID:2e8a PID:0005");
    }
}
