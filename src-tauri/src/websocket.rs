use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedDevice {
    pub id: String,
    pub device_type: String,
    pub last_seen: i64,
    pub paired_with_client: Option<String>,
    pub paired_with_esp32: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceMessage {
    #[serde(rename = "type")]
    pub msg_type: i32,
    pub device_id: Option<String>,
    pub data: Option<serde_json::Value>,
}

pub struct WebSocketServer {
    devices: Arc<Mutex<HashMap<String, ConnectedDevice>>>,
    app_handle: AppHandle,
}

impl WebSocketServer {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            devices: Arc::new(Mutex::new(HashMap::new())),
            app_handle,
        }
    }

    async fn handle_connection(&self, stream: TcpStream, client_id: String) {
        let ws_stream = match accept_async(stream).await {
            Ok(ws) => ws,
            Err(e) => {
                eprintln!("WebSocket handshake failed: {}", e);
                return;
            }
        };

        // _write must stay alive for the full duration — dropping it early closes
        // the WebSocket write half and causes the read loop to terminate immediately.
        let (_write, mut read) = ws_stream.split();
        let devices = self.devices.clone();

        // Add client to devices
        {
            let mut devices_lock = devices.lock().await;
            devices_lock.insert(
                client_id.clone(),
                ConnectedDevice {
                    id: client_id.clone(),
                    device_type: "browser".to_string(),
                    last_seen: chrono::Utc::now().timestamp(),
                    paired_with_client: None,
                    paired_with_esp32: None,
                },
            );
        }

        // Send initial device list
        self.broadcast_device_list().await;

        // Handle incoming messages
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(device_msg) = serde_json::from_str::<DeviceMessage>(&text) {
                        self.handle_device_message(device_msg, &client_id).await;
                    }
                }
                Ok(Message::Close(_)) => {
                    break;
                }
                Err(e) => {
                    eprintln!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }

        // Remove client on disconnect
        {
            let mut devices_lock = devices.lock().await;
            devices_lock.remove(&client_id);
        }

        self.broadcast_device_list().await;
    }

    async fn handle_device_message(&self, msg: DeviceMessage, client_id: &str) {
        match msg.msg_type {
            1 => {
                // Device selection
                if let Some(device_id) = msg.device_id {
                    self.pair_device(client_id, &device_id).await;
                }
            }
            3 => {
                // Wheel speed message - forward to paired ESP32
                self.forward_to_paired_device(client_id, msg).await;
            }
            5 => {
                // Relay mode switch - forward to paired ESP32
                self.forward_to_paired_device(client_id, msg).await;
            }
            _ => {
                // Forward other messages to paired device
                self.forward_to_paired_device(client_id, msg).await;
            }
        }
    }

    async fn pair_device(&self, client_id: &str, device_id: &str) {
        let mut devices = self.devices.lock().await;
        
        // Update client pairing
        if let Some(client) = devices.get_mut(client_id) {
            client.paired_with_esp32 = Some(device_id.to_string());
        }

        // Update ESP32 pairing
        if let Some(esp32) = devices.get_mut(device_id) {
            esp32.paired_with_client = Some(client_id.to_string());
        }

        drop(devices);
        self.broadcast_device_list().await;
    }

    async fn forward_to_paired_device(&self, from_id: &str, msg: DeviceMessage) {
        let devices = self.devices.lock().await;
        
        if let Some(from_device) = devices.get(from_id) {
            if let Some(paired_id) = &from_device.paired_with_esp32 {
                // Emit to frontend via Tauri event
                let _ = self.app_handle.emit_all("device-message", msg);
            }
        }
    }

    async fn broadcast_device_list(&self) {
        let devices = self.devices.lock().await;
        let device_list: Vec<ConnectedDevice> = devices.values().cloned().collect();
        
        let _ = self.app_handle.emit_all("device-list", device_list);
    }
}

pub async fn start_websocket_server(app_handle: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let addr = "0.0.0.0:8765";
    let listener = TcpListener::bind(addr).await?;
    println!("WebSocket server listening on: {}", addr);

    let server = Arc::new(WebSocketServer::new(app_handle));

    while let Ok((stream, _)) = listener.accept().await {
        let client_id = Uuid::new_v4().to_string();
        let server_clone = server.clone();
        
        tokio::spawn(async move {
            server_clone.handle_connection(stream, client_id).await;
        });
    }

    Ok(())
}
