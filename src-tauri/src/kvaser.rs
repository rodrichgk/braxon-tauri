//! Kvaser Leaf Light (or any Kvaser CANlib device) as a drop-in replacement
//! for the Pico/Nano CAN bridge while the custom PCB can't originate CAN.
//!
//! The rest of the app only ever speaks one line protocol:
//!
//!   TX  "CANTx : <id_hex> <b0_hex> .. <b7_hex>"      (from lib/isotp.ts, DTCScanner)
//!   RX  "<id_dec> <dlc_dec> <b0_dec> .. <bn_dec>"    (parsed by lib/isotp.ts, CANSettings)
//!
//! so this module just translates those lines to/from CANlib calls and emits
//! frames on `kvaser-data` / `kvaser-disconnected`, exactly mirroring what
//! serial.rs + commands.rs::connect_serial do for the board. `clientSerial.ts`
//! swaps which command/event pair it uses based on the selected interface;
//! nothing downstream of it changes.
//!
//! `canlib32.dll` is loaded at runtime via `libloading`, so a build without
//! the Kvaser drivers installed still launches — the failure surfaces only
//! when the user actually picks the Kvaser interface and hits Connect.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
pub struct KvaserChannelInfo {
    pub index: i32,
    pub name: String,
    /// Card serial number as printed on the device (empty if the driver
    /// wouldn't report it). Lets the operator match "Ser. No: 0188".
    pub serial: String,
}

/// Owns the mpsc Sender to the background worker thread. The worker owns the
/// CANlib handle — same ownership split as SerialConnection.
pub struct KvaserConnection {
    lib: Option<Arc<CanLib>>,
    tx_sender: Option<Sender<String>>,
    stop_flag: Arc<AtomicBool>,
}

impl KvaserConnection {
    pub fn new() -> Self {
        Self {
            lib: None,
            tx_sender: None,
            stop_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    fn ensure_lib(&mut self) -> Result<Arc<CanLib>, String> {
        if let Some(l) = &self.lib {
            return Ok(l.clone());
        }
        let l = Arc::new(CanLib::load()?);
        self.lib = Some(l.clone());
        Ok(l)
    }

    pub fn list_channels(&mut self) -> Result<Vec<KvaserChannelInfo>, String> {
        self.ensure_lib()?.list_channels()
    }

    /// Opens `channel` at `bitrate` (accepts bps or kbps) and hands back the
    /// pieces the worker thread needs. Mirrors SerialConnection::connect.
    pub fn connect(
        &mut self,
        channel: i32,
        bitrate: u32,
    ) -> Result<(Arc<CanLib>, i32, Receiver<String>), String> {
        let lib = self.ensure_lib()?;
        self.stop_flag.store(false, Ordering::SeqCst);
        let handle = lib.open(channel, bitrate)?;
        let (tx, rx) = mpsc::channel::<String>();
        self.tx_sender = Some(tx);
        Ok((lib, handle, rx))
    }

    pub fn disconnect(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        self.tx_sender = None; // dropping the Sender also unblocks the worker
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
                .map_err(|_| "Kvaser interface not connected".to_string()),
            None => Err("Kvaser interface not connected".to_string()),
        }
    }
}

pub type SharedKvaserConnection = Arc<Mutex<KvaserConnection>>;

pub fn create_kvaser_connection() -> SharedKvaserConnection {
    Arc::new(Mutex::new(KvaserConnection::new()))
}

/* ── line <-> frame translation (shared by both platform impls) ─────────── */

/// `"CANTx : 7E0 03 19 02 FF 00 00 00 00"` -> `(0x7E0, [03,19,02,FF,00,00,00,00])`.
/// Returns `None` for any other line the app puts on the wire (the `t\n`
/// handshake ping, `CANSpeed : …`, `Waveform : …`), which the Kvaser simply
/// has no equivalent for and should ignore.
fn parse_cantx(line: &str) -> Option<(i64, Vec<u8>)> {
    let rest = line.trim().strip_prefix("CANTx")?;
    let rest = rest.trim_start();
    let rest = rest.strip_prefix(':').unwrap_or(rest);
    let mut it = rest.split_whitespace();
    let id = i64::from_str_radix(it.next()?, 16).ok()?;
    let data: Vec<u8> = it
        .take(8)
        .filter_map(|b| u8::from_str_radix(b, 16).ok())
        .collect();
    Some((id, data))
}

/// Frame -> `"<id_dec> <dlc_dec> <b0_dec> …"`, the exact shape `parseCanLine()`
/// in lib/isotp.ts and `parseNanoFrame()` in CANSettings.tsx expect (they
/// require `parts.len() == 2 + dlc`, so no trailing padding).
fn format_frame(id: i64, data: &[u8]) -> String {
    let mut s = format!("{} {}", id, data.len());
    for b in data {
        s.push(' ');
        s.push_str(&b.to_string());
    }
    s
}

/* ── Windows: real CANlib binding ──────────────────────────────────────── */

#[cfg(windows)]
mod imp {
    use super::{format_frame, parse_cantx, KvaserChannelInfo};
    use libloading::Library;
    use std::ffi::c_void;
    use std::os::raw::{c_char, c_int, c_long, c_uint, c_ulong};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::{Receiver, TryRecvError};
    use std::sync::Arc;
    use tauri::Manager;

    // canlib.h constants (the subset we use).
    const CAN_OK: c_int = 0;
    const CAN_ERR_NOMSG: c_int = -2;
    const CAN_MSG_STD: c_uint = 0x0002;
    const CAN_MSG_EXT: c_uint = 0x0004;
    const CAN_MSG_RTR: c_uint = 0x0001;
    const CAN_MSG_ERROR_FRAME: c_uint = 0x0020;
    // Our own transmitted frames, echoed back by the driver — never treat
    // these as ECU responses.
    const CAN_MSG_TXACK: c_uint = 0x0040;
    const CAN_MSG_TXRQ: c_uint = 0x0080;
    const CAN_DRIVER_NORMAL: c_uint = 4;
    const CHANNELDATA_CARD_SERIAL_NO: c_int = 7;
    const CHANNELDATA_CHANNEL_NAME: c_int = 13;
    // Predefined bus-param codes: passed as `freq`, other params then ignored.
    fn bitrate_code(bitrate: u32) -> c_long {
        match bitrate {
            1_000_000 | 1000 => -1, // canBITRATE_1M
            250_000 | 250 => -3,    // canBITRATE_250K
            125_000 | 125 => -4,    // canBITRATE_125K
            100_000 | 100 => -5,    // canBITRATE_100K
            _ => -2,                // canBITRATE_500K — OBD / ISO 15765-4 default
        }
    }

    type FnVoid = unsafe extern "system" fn();
    type FnNumChannels = unsafe extern "system" fn(*mut c_int) -> c_int;
    type FnChannelData = unsafe extern "system" fn(c_int, c_int, *mut c_void, usize) -> c_int;
    type FnOpenChannel = unsafe extern "system" fn(c_int, c_int) -> c_int;
    type FnSetBusParams =
        unsafe extern "system" fn(c_int, c_long, c_uint, c_uint, c_uint, c_uint, c_uint) -> c_int;
    type FnSetOutputCtl = unsafe extern "system" fn(c_int, c_uint) -> c_int;
    type FnBus = unsafe extern "system" fn(c_int) -> c_int;
    type FnWrite = unsafe extern "system" fn(c_int, c_long, *const c_void, c_uint, c_uint) -> c_int;
    type FnReadWait = unsafe extern "system" fn(
        c_int,
        *mut c_long,
        *mut c_void,
        *mut c_uint,
        *mut c_uint,
        *mut c_ulong,
        c_ulong,
    ) -> c_int;
    type FnErrText = unsafe extern "system" fn(c_int, *mut c_char, usize) -> c_int;

    pub struct CanLib {
        // Kept alive so the resolved fn pointers stay valid; never touched again.
        _lib: Library,
        init: FnVoid,
        num_channels: FnNumChannels,
        channel_data: FnChannelData,
        open_channel: FnOpenChannel,
        set_bus_params: FnSetBusParams,
        set_output_ctl: FnSetOutputCtl,
        bus_on: FnBus,
        bus_off: FnBus,
        close: FnBus,
        write: FnWrite,
        read_wait: FnReadWait,
        err_text: FnErrText,
    }

    // Bare fn pointers + Library are Send/Sync; the worker thread takes an Arc.
    unsafe impl Send for CanLib {}
    unsafe impl Sync for CanLib {}

    impl CanLib {
        pub fn load() -> Result<Self, String> {
            let lib = unsafe {
                Library::new("canlib32.dll")
                    .or_else(|_| Library::new("canlib32"))
                    .map_err(|e| {
                        format!("Kvaser CANlib not found ({e}). Install \"Kvaser Drivers for Windows\".")
                    })?
            };

            macro_rules! sym {
                ($ty:ty, $name:literal) => {{
                    let s: libloading::Symbol<$ty> = unsafe { lib.get($name) }.map_err(|e| {
                        format!(
                            "canlib32.dll is missing {}: {e}",
                            std::str::from_utf8(&$name[..$name.len() - 1]).unwrap_or("?")
                        )
                    })?;
                    *s
                }};
            }

            let me = CanLib {
                init: sym!(FnVoid, b"canInitializeLibrary\0"),
                num_channels: sym!(FnNumChannels, b"canGetNumberOfChannels\0"),
                channel_data: sym!(FnChannelData, b"canGetChannelData\0"),
                open_channel: sym!(FnOpenChannel, b"canOpenChannel\0"),
                set_bus_params: sym!(FnSetBusParams, b"canSetBusParams\0"),
                set_output_ctl: sym!(FnSetOutputCtl, b"canSetBusOutputControl\0"),
                bus_on: sym!(FnBus, b"canBusOn\0"),
                bus_off: sym!(FnBus, b"canBusOff\0"),
                close: sym!(FnBus, b"canClose\0"),
                write: sym!(FnWrite, b"canWrite\0"),
                read_wait: sym!(FnReadWait, b"canReadWait\0"),
                err_text: sym!(FnErrText, b"canGetErrorText\0"),
                _lib: lib,
            };
            unsafe { (me.init)() };
            Ok(me)
        }

        fn err(&self, code: c_int) -> String {
            let mut buf = [0u8; 128];
            unsafe { (self.err_text)(code, buf.as_mut_ptr() as *mut c_char, buf.len()) };
            let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
            format!("{} (code {code})", String::from_utf8_lossy(&buf[..end]))
        }

        pub fn list_channels(&self) -> Result<Vec<KvaserChannelInfo>, String> {
            let mut count: c_int = 0;
            let st = unsafe { (self.num_channels)(&mut count) };
            if st != CAN_OK {
                return Err(format!("canGetNumberOfChannels failed: {}", self.err(st)));
            }

            let mut out = Vec::with_capacity(count.max(0) as usize);
            for ch in 0..count {
                let mut name_buf = [0u8; 64];
                let name = if unsafe {
                    (self.channel_data)(
                        ch,
                        CHANNELDATA_CHANNEL_NAME,
                        name_buf.as_mut_ptr() as *mut c_void,
                        name_buf.len(),
                    )
                } == CAN_OK
                {
                    let end = name_buf.iter().position(|&b| b == 0).unwrap_or(name_buf.len());
                    String::from_utf8_lossy(&name_buf[..end]).into_owned()
                } else {
                    format!("CAN channel {ch}")
                };

                let mut ser_buf = [0u8; 8];
                let serial = if unsafe {
                    (self.channel_data)(
                        ch,
                        CHANNELDATA_CARD_SERIAL_NO,
                        ser_buf.as_mut_ptr() as *mut c_void,
                        ser_buf.len(),
                    )
                } == CAN_OK
                {
                    let n = u64::from_le_bytes(ser_buf);
                    if n == 0 { String::new() } else { n.to_string() }
                } else {
                    String::new()
                };

                out.push(KvaserChannelInfo { index: ch, name, serial });
            }
            Ok(out)
        }

        /// Open + configure + go bus-on. Returns the CANlib handle.
        pub fn open(&self, channel: c_int, bitrate: u32) -> Result<c_int, String> {
            let h = unsafe { (self.open_channel)(channel, 0) };
            if h < 0 {
                return Err(format!("canOpenChannel({channel}) failed: {}", self.err(h)));
            }
            let fail = |st: c_int, what: &str| -> String {
                unsafe { (self.close)(h) };
                format!("{what} failed: {}", self.err(st))
            };
            let st = unsafe { (self.set_bus_params)(h, bitrate_code(bitrate), 0, 0, 0, 0, 0) };
            if st != CAN_OK {
                return Err(fail(st, "canSetBusParams"));
            }
            let st = unsafe { (self.set_output_ctl)(h, CAN_DRIVER_NORMAL) };
            if st != CAN_OK {
                return Err(fail(st, "canSetBusOutputControl"));
            }
            let st = unsafe { (self.bus_on)(h) };
            if st != CAN_OK {
                return Err(fail(st, "canBusOn"));
            }
            Ok(h)
        }
    }

    /// Blocking loop, run on a dedicated std::thread (never the async runtime).
    /// Same structure as the serial worker in commands.rs::connect_serial.
    ///
    /// Deliberately resilient: a quiet bus, error frames, a momentary bus-off
    /// from a marginal ACK, or a `canWrite`/`canReadWait` hiccup must NOT end
    /// the session — the JS side drops the whole UDS session the instant
    /// `kvaser-disconnected` fires, so a spurious drop makes the DTC scanner's
    /// session flap between "opening" and "not connected". Only a real, held
    /// failure (device unplugged → ~2 s of solid errors) or an explicit
    /// disconnect tears the connection down.
    pub fn run_worker(
        lib: Arc<CanLib>,
        handle: c_int,
        rx: Receiver<String>,
        stop_flag: Arc<AtomicBool>,
        app: tauri::AppHandle,
    ) {
        use std::time::{Duration, Instant};

        let mut id: c_long = 0;
        let mut msg = [0u8; 64];
        let mut dlc: c_uint = 0;
        let mut flag: c_uint = 0;
        let mut time: c_ulong = 0;

        // Give up only after this long of *uninterrupted* read errors.
        const READ_FAIL_GRACE: Duration = Duration::from_millis(2000);
        let mut read_failing_since: Option<Instant> = None;
        // Throttle diagnostic lines so a bus-off storm can't flood the webview.
        let mut last_diag = Instant::now() - Duration::from_secs(1);
        let diag = |app: &tauri::AppHandle, since: &mut Instant, m: String| {
            if since.elapsed() >= Duration::from_millis(750) {
                *since = Instant::now();
                let _ = app.emit_all("kvaser-data", &format!("# {m}"));
            }
        };

        'run: loop {
            if stop_flag.load(Ordering::SeqCst) {
                break;
            }

            // ---- TX: drain queued CANTx lines (non-blocking) ----
            loop {
                match rx.try_recv() {
                    Ok(line) => {
                        if let Some((tx_id, data)) = parse_cantx(&line) {
                            let n = data.len().min(8) as c_uint;
                            let fl = if tx_id > 0x7FF { CAN_MSG_EXT } else { CAN_MSG_STD };
                            let st = unsafe {
                                (lib.write)(handle, tx_id as c_long, data.as_ptr() as *const c_void, n, fl)
                            };
                            // A failed write (typically transient bus-off from a
                            // missing ACK — the device auto-recovers) is logged,
                            // not fatal.
                            if st != CAN_OK {
                                diag(&app, &mut last_diag, format!("canWrite: {}", lib.err(st)));
                            }
                        }
                    }
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => break 'run, // disconnect() dropped the Sender
                }
            }

            // ---- RX: one frame, 20 ms wait (keeps TX latency + stop responsive) ----
            let st = unsafe {
                (lib.read_wait)(
                    handle,
                    &mut id,
                    msg.as_mut_ptr() as *mut c_void,
                    &mut dlc,
                    &mut flag,
                    &mut time,
                    20,
                )
            };
            if st == CAN_OK {
                read_failing_since = None;
                // Skip error frames, remote frames, and the driver's echo of
                // our own transmissions.
                if flag & (CAN_MSG_ERROR_FRAME | CAN_MSG_RTR | CAN_MSG_TXACK | CAN_MSG_TXRQ) != 0 {
                    continue;
                }
                let n = (dlc as usize).min(8);
                let _ = app.emit_all("kvaser-data", &format_frame(id as i64, &msg[..n]));
            } else if st == CAN_ERR_NOMSG {
                read_failing_since = None; // a quiet bus is not a failure
            } else {
                // Persistent read errors == the device is really gone.
                let since = *read_failing_since.get_or_insert_with(Instant::now);
                diag(&app, &mut last_diag, format!("canReadWait: {}", lib.err(st)));
                if since.elapsed() >= READ_FAIL_GRACE {
                    let _ = app.emit_all(
                        "kvaser-data",
                        &format!("# giving up: {} for >2s", lib.err(st)),
                    );
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        }

        unsafe {
            (lib.bus_off)(handle);
            (lib.close)(handle);
        }
        let _ = app.emit_all("kvaser-disconnected", ());
    }
}

/* ── Non-Windows: compile-only stub (Kvaser drivers are Windows-only here) ─ */

#[cfg(not(windows))]
mod imp {
    use super::KvaserChannelInfo;
    use std::sync::atomic::AtomicBool;
    use std::sync::mpsc::Receiver;
    use std::sync::Arc;

    const MSG: &str = "Kvaser support is only built on Windows";

    pub struct CanLib;
    unsafe impl Send for CanLib {}
    unsafe impl Sync for CanLib {}

    impl CanLib {
        pub fn load() -> Result<Self, String> {
            Err(MSG.into())
        }
        pub fn list_channels(&self) -> Result<Vec<KvaserChannelInfo>, String> {
            Err(MSG.into())
        }
        pub fn open(&self, _channel: i32, _bitrate: u32) -> Result<i32, String> {
            Err(MSG.into())
        }
    }

    pub fn run_worker(
        _lib: Arc<CanLib>,
        _handle: i32,
        _rx: Receiver<String>,
        _stop_flag: Arc<AtomicBool>,
        _app: tauri::AppHandle,
    ) {
    }
}

pub use imp::{run_worker, CanLib};
