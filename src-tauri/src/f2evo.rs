//! Protocol for the legacy "SC F2-EVO" test-bench boards (GRMtronics / BEEFIX
//! hardware), reverse-engineered from the original .NET application
//! (`SC F2-EVO.exe`, `ElectronikSistem.dll`) after the source was lost when
//! the original developer left. No USB/serial capture was needed — the
//! commands and response formats below were pulled directly out of the
//! decompiled `ABS.cs`, `Cambi.cs`, `FormHydraulicBench.cs`, `FormSensor.cs`
//! and `FormWashing.cs`.
//!
//! Transport is unchanged: this rides on the existing `serial` module
//! (115200 baud, line-based framing) — the original app used the exact same
//! `SerialPort` settings, so no transport changes were needed, only this
//! payload layer.
//!
//! The five boards share one quirk worth calling out: only the
//! Electronics/ABS board's raw command channel (`ABS.InviaComando`, and the
//! Dashboard/status screen `WorkinigProgress`) prefixes commands with STX
//! (0x02). Every other board — Gearbox, Hydraulic Bench, Sensor, Washing —
//! sends plain text. Getting this wrong means the board silently ignores
//! the command, so each board's `to_frame()` below matches its original
//! call site exactly rather than sharing one generic framer.

use serde::Serialize;

/// Start-of-text marker required only by the Electronics/ABS board's raw
/// command channel (`ABS.cs` / `WorkinigProgress.cs`, both call
/// `InviaComando` which prepends this).
const STX: char = '\u{2}';

/// `Volt:<raw>` response → volts. From `ABS.Handle_DataReceived`:
/// `Voltage *= 0.0146484375;`
pub const VOLT_SCALE: f64 = 0.0146484375;

/// `Current:<raw>` response → amps. From `ABS.Handle_DataReceived`:
/// `result *= 0.06103515625;`
pub const CURRENT_SCALE: f64 = 0.06103515625;

fn stx_frame(cmd: impl Into<String>) -> String {
    format!("{STX}{}", cmd.into())
}

// ============================================================
// Electronics / ABS board — ABS.cs `InviaComando` (com 0/1, STX-prefixed)
// ============================================================
pub mod electronics {
    use super::stx_frame;
    use serde::Deserialize;

    #[derive(Debug, Clone, PartialEq, Deserialize)]
    #[serde(tag = "action", rename_all = "snake_case")]
    pub enum Command {
        SetRelay { on: bool },
        SetRelayExt { on: bool },
        Frequency { hz: i32 },
        SelectOut { channel: u8 },
        Active,
        Passive,
        StartTest,
        StopTest,
        CheckCode,
        ReadVolt,
        ReadCurrent,
        ReadComunication,
        WheelStop { wheel: u8 },
        WheelGo { wheel: u8 },
        Push,
        Release,
        TurnOffMotor,
        /// Handshake ack — enqueued bare in `ABS.cs:909`, bypassing
        /// `InviaComando`, so unlike everything else here it is NOT
        /// STX-prefixed.
        AckElectronics,
    }

    impl Command {
        /// Exact wire text, matching `ABS.InviaComando` / the direct
        /// `BufferTx.Enqueue` call sites in `ABS.cs`.
        pub fn to_frame(&self) -> String {
            use Command::*;
            match self {
                SetRelay { on } => stx_frame(if *on { "Set Rele ON" } else { "Set Rele OFF" }),
                SetRelayExt { on } => {
                    stx_frame(if *on { "Set ReleExt ON" } else { "Set ReleExt OFF" })
                }
                Frequency { hz } => stx_frame(format!("Frequency:{hz}Hz")),
                SelectOut { channel } => stx_frame(format!("Select OUT:{channel}")),
                Active => stx_frame("Active"),
                Passive => stx_frame("Passive"),
                StartTest => stx_frame("Start Test"),
                StopTest => stx_frame("Stop Test"),
                CheckCode => stx_frame("Check Code"),
                ReadVolt => stx_frame("Volt"),
                ReadCurrent => stx_frame("Current"),
                ReadComunication => stx_frame("Comunication"),
                WheelStop { wheel } => stx_frame(format!("Wheel Stop:{wheel}")),
                WheelGo { wheel } => stx_frame(format!("Wheel Go:{wheel}")),
                Push => stx_frame("Push"),
                Release => stx_frame("Release"),
                TurnOffMotor => stx_frame("Turn Off Motor"),
                AckElectronics => "ACK Electronics".to_string(),
            }
        }
    }
}

// ============================================================
// Gearbox (Cambi) — Cambi.cs `InviaComando` (com 0/1, plain text)
// ============================================================
pub mod gearbox {
    use serde::Deserialize;

    #[derive(Debug, Clone, PartialEq, Deserialize)]
    #[serde(tag = "action", rename_all = "snake_case")]
    pub enum Command {
        SetRelay { on: bool },
        Frequency { hz: i32 },
        SelectOut { channel: u8 },
        EnableSpeed,
        DisableSpeed,
        StartTest,
        StopTest,
        SetGearbox,
        SetClutch,
        SetPositionChange,
        SetParking,
        SetDown,
        SetUp,
        SetPositionR,
        SetPositionN,
        SetPositionD,
        SetPositionS,
        SetPositionStop,
    }

    impl Command {
        /// Cambi.cs never adds STX (see `Cambi.InviaComando`, which enqueues
        /// `cmd` unmodified) — plain text only.
        pub fn to_frame(&self) -> String {
            use Command::*;
            match self {
                SetRelay { on } => (if *on { "Set Rele ON" } else { "Set Rele OFF" }).to_string(),
                Frequency { hz } => format!("Frequency:{hz}Hz"),
                SelectOut { channel } => format!("Select OUT:{channel}"),
                EnableSpeed => "Enable Speed".to_string(),
                DisableSpeed => "Disable Speed".to_string(),
                StartTest => "Start Test".to_string(),
                StopTest => "Stop Test".to_string(),
                SetGearbox => "Set GEARBOX".to_string(),
                SetClutch => "Set CLUTCH".to_string(),
                SetPositionChange => "Set Position Change".to_string(),
                SetParking => "Set Parking".to_string(),
                SetDown => "Set Down".to_string(),
                SetUp => "Set UP".to_string(),
                SetPositionR => "Set Position R".to_string(),
                SetPositionN => "Set Position N".to_string(),
                SetPositionD => "Set Position D".to_string(),
                SetPositionS => "Set Position S".to_string(),
                SetPositionStop => "Set Position Stop".to_string(),
            }
        }
    }
}

// ============================================================
// Hydraulic Bench — FormHydraulicBench.cs `Comand` queue (plain text)
// ============================================================
pub mod hydraulic {
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, PartialEq, Deserialize)]
    #[serde(tag = "action", rename_all = "snake_case")]
    pub enum Command {
        EnableStatus,
        DisableStatus,
        GetModel,
        GetSerialNumber,
        AckHydraulics,
        ReportReceived,
        PodEnable,
        PodDisable,
        Reset,
        Oil,
        Unlock { channel: u8 },
        /// Pump on/off — `OnOff_Click`: `"Pompa:" + OnOff.Tag` (same verb
        /// the Sensor board's `Pompa:` command uses).
        Pump { on: bool },
        /// The bleeding-cycle top-level test button (`Bleeding.Tag`).
        Bleeding,
        /// The valve-test top-level button (`Valves.Tag`).
        Valves,
        /// The motor-test top-level button (`Motor.Tag`).
        Motor,
        /// The "Hydraulic Test" button — wire text is `PRESSURE`
        /// (`HydraulicTest.Tag`), it's the pressure/valve-closure cycle
        /// shown running as the red banner in the UI.
        HydraulicTest,
        /// The "Cycle" button (`Cycle.Tag`).
        Cycles,
        /// The "Programs Cycle" button (`Program.Tag`).
        ShortCycles,
        /// The "Report" button (`Print.Tag`).
        PrintReport,
        /// Pressure-cycle test buttons are data-driven: the exact command
        /// text comes from `DataButton.Command`, populated from
        /// `ElectronicsData.accdb` at runtime, not hardcoded in the .NET
        /// source. Pass the string straight from that config/DB export.
        RawCycleCommand { text: String },
        /// One line of the "load program" upload — `Parametri`/valve array/
        /// `ParametriTest`/`ParametriCiclo`/`DataCanale`/`Salva`, JSON-
        /// serialized by `hydraulic_import::build_abs_upload` to match
        /// .NET's `JavaScriptSerializer` output. Enqueued one at a time,
        /// same as any other command — mirrors `BufferTX.Enqueue(text)` in
        /// `FormHydraulicData.cs`'s `Invia_Click`, which reuses the bench's
        /// own command queue (`BufferTX = form.Comand`) for these.
        RawJsonPayload { json: String },
    }

    impl Command {
        pub fn to_frame(&self) -> String {
            use Command::*;
            match self {
                EnableStatus => "ENABLESTATUS".to_string(),
                DisableStatus => "DISABLESTATUS".to_string(),
                GetModel => "H-GETMODEL".to_string(),
                GetSerialNumber => "H-SERIALNUMBER".to_string(),
                AckHydraulics => "ACK Hydraulics".to_string(),
                ReportReceived => "H-REPORTRECEIVED".to_string(),
                PodEnable => "H-POD:ENABLE".to_string(),
                PodDisable => "H-POD:DISABLE".to_string(),
                Reset => "H-RESET".to_string(),
                Oil => "H-OIL".to_string(),
                Unlock { channel } => format!("UNLOCK:{channel}"),
                Pump { on } => format!("Pompa:{}", if *on { "ON" } else { "OFF" }),
                Bleeding => "BLEEDING".to_string(),
                Valves => "VALVES".to_string(),
                Motor => "MOTOR".to_string(),
                HydraulicTest => "PRESSURE".to_string(),
                Cycles => "H-CYCLES".to_string(),
                ShortCycles => "SHORTCYCLES".to_string(),
                PrintReport => "PRINTREPORT".to_string(),
                RawCycleCommand { text } => text.clone(),
                RawJsonPayload { json } => json.clone(),
            }
        }
    }

    /// `Status:` response is a `;`-joined telemetry frame — nominally 39
    /// fields per `FormHydraulicBench.ReportDiagnostic`'s
    /// `array.Length == 39` check, though real hardware has been observed
    /// sending fewer while idle (see `parse_status`'s doc comment), so this
    /// is used only as a label for the "full" shape in tests, not enforced
    /// as a hard requirement.
    #[allow(dead_code)]
    pub const STATUS_FIELD_COUNT: usize = 39;

    /// A pressure channel reading: primary value plus the secondary value
    /// carried in the frame's second half (fields 31-34) — the original UI
    /// draws both on the gauge, separated by `|`.
    #[derive(Debug, Clone, Copy, PartialEq, Serialize)]
    pub struct ChannelPressure {
        pub primary: f64,
        pub secondary: f64,
    }

    /// Fully decoded `Status:` telemetry — the same data driving the 5
    /// pressure gauges, current/temperature readouts, OIL indicator,
    /// progress bar and fault banner in `FormHydraulicBench`
    /// (`ReportDiagnostic` / `RefreshStatus1`).
    #[derive(Debug, Clone, PartialEq, Serialize)]
    pub struct Telemetry {
        pub pump_pressure: f64,
        pub channel1: ChannelPressure,
        pub channel2: ChannelPressure,
        pub channel3: ChannelPressure,
        pub channel4: ChannelPressure,
        pub current_amps: f64,
        pub temperature_c: f64,
        /// "Ready" / "Busy" / "Wait" / "Error" / ... (`array[7]`).
        pub ready_state: String,
        pub progress_percent: f64,
        /// Oil floater reading (`array[27]`): >1.5 = ok, >0.5 = low, else
        /// critical — thresholds from `RefreshFloater`.
        pub oil_level: f64,
        pub oil_status: OilStatus,
        /// `array[29] == "1"`.
        pub pod_enabled: bool,
        /// Decoded `array[19]` protection bitmask — human-readable fault
        /// messages, in the same order `ReportDiagnostic`/`RefreshStatus1`
        /// check them (first match wins there; all active ones listed
        /// here).
        pub protection_faults: Vec<String>,
        /// `array[13]`, signed: sign indicates start/end, magnitude indexes
        /// the model's step-description table (DB-driven, not decoded
        /// here).
        pub test_step_index: i32,
        /// `array[38]`; -1 when no single valve is under individual test.
        pub valve_under_test: i32,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Serialize)]
    #[serde(rename_all = "snake_case")]
    pub enum OilStatus {
        Ok,
        Low,
        Critical,
    }

    fn parse_f64(field: &str) -> Option<f64> {
        // Board sends '.'-decimal text (the original app round-trips it
        // through ',' only to satisfy the it-IT culture parser).
        field.trim().parse::<f64>().ok()
    }

    /// Decodes the 8 protection-bitmask fault messages
    /// (`FormHydraulicBench.RefreshStatus1`'s `Protection` handling).
    fn protection_faults(mask: u16) -> Vec<String> {
        const FAULTS: [(u16, &str); 8] = [
            (1, "Regolator...."),
            (2, "Shield: Protection opened."),
            (4, "Pressure loss."),
            (8, "ABS not connected."),
            (0x10, "Decoder ..."),
            (0x20, "Wrong ABS comparison ..."),
            (0x40, "Refill the oil! ..."),
            (0x80, "Working pressure! ..."),
        ];
        FAULTS
            .iter()
            .filter(|(bit, _)| mask & bit != 0)
            .map(|(_, msg)| msg.to_string())
            .collect()
    }

    /// Parses a `Status:` frame into structured telemetry.
    ///
    /// The original decompiled source checks `array.Length == 39` before
    /// parsing anything, but real hardware doesn't actually hold to that:
    /// a bench idling with no ABS model loaded sends a shorter frame (37
    /// fields observed) than one mid-test. Rather than reject those frames
    /// outright — which silently starved the gauges of any data at all —
    /// this only requires the front fields every observed frame has had
    /// (pump/channel pressures, current, temperature, ready state) and
    /// treats everything past that as optional, defaulting gracefully
    /// when a trailing field isn't present.
    pub fn parse_status(fields: &[String]) -> Option<Telemetry> {
        const CORE_FIELDS: usize = 8; // indices 0-7 must be present
        if fields.len() < CORE_FIELDS {
            return None;
        }
        let f = |i: usize| fields.get(i).and_then(|s| parse_f64(s));

        let pump_pressure = f(0)?;
        let channel1 = ChannelPressure {
            primary: f(1)?,
            secondary: f(31).unwrap_or(0.0),
        };
        let channel2 = ChannelPressure {
            primary: f(2)?,
            secondary: f(32).unwrap_or(0.0),
        };
        let channel3 = ChannelPressure {
            primary: f(3)?,
            secondary: f(33).unwrap_or(0.0),
        };
        let channel4 = ChannelPressure {
            primary: f(4)?,
            secondary: f(34).unwrap_or(0.0),
        };
        let current_amps = f(5)?;
        let temperature_c = f(6)?;
        let ready_state = fields[7].clone();
        let progress_value = fields.get(20).and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
        let progress_max = fields
            .get(21)
            .and_then(|s| s.trim().parse::<f64>().ok())
            .filter(|m| *m > 0.0)
            .unwrap_or(100.0);
        let mask: u16 = fields.get(19).and_then(|s| s.trim().parse().ok()).unwrap_or(0);
        let oil_level = f(27).unwrap_or(0.0);
        let oil_status = if oil_level > 1.5 {
            OilStatus::Ok
        } else if oil_level > 0.5 {
            OilStatus::Low
        } else {
            OilStatus::Critical
        };

        Some(Telemetry {
            pump_pressure,
            channel1,
            channel2,
            channel3,
            channel4,
            current_amps,
            temperature_c,
            ready_state,
            progress_percent: (progress_value / progress_max * 100.0).clamp(0.0, 100.0),
            oil_level,
            oil_status,
            pod_enabled: fields.get(29).map(|s| s.trim() == "1").unwrap_or(false),
            protection_faults: protection_faults(mask),
            test_step_index: fields.get(13).and_then(|s| s.trim().parse().ok()).unwrap_or(0),
            valve_under_test: fields.get(38).and_then(|s| s.trim().parse().ok()).unwrap_or(-1),
        })
    }

    // ========================================================
    // Test report parsing — turns the free-text `Report:` telemetry (see
    // `F2EvoEvent::HydraulicReport`) into structured per-test results.
    // Mirrors `FormHydraulicBench.cs`'s own two passes over this exact
    // text: `SendReport` (line-by-line keyword scanning, used here for the
    // Motor/Pressure semantics) and `ReportOpen` (the Valve fault-severity
    // coloring). Bleeding never appears here at all — confirmed against the
    // decompiled source, `SendReport` has no code path that builds
    // anything from a Bleeding line.
    // ========================================================

    /// A valve's optional coil-resistance check result. Only present when
    /// the bench's "resistor check" diagnostic mode is on
    /// (`IsResistorChecked` in the original) — gates whether the board
    /// emits these lines at all, not decoded here since it isn't visible
    /// in the report text itself.
    #[derive(Debug, Clone, Copy, PartialEq, Serialize)]
    #[serde(tag = "status", rename_all = "snake_case")]
    pub enum ValveStatus {
        /// No "Fault" text on the line.
        Ok,
        /// `Fault;X` with `10 < X <= 15` — the original's DarkOrange
        /// threshold: worth a look, not a real failure.
        Marginal { code: u8 },
        /// `Fault;X` with `X <= 10` — the original's Red threshold.
        Fault { code: u8 },
        /// `Fault;X` with `X > 15` — the original's `ReportOpen` doesn't
        /// assign this any color at all (falls through both branches),
        /// which in practice reads as "not actually a problem."
        Informational { code: u8 },
    }

    #[derive(Debug, Clone, PartialEq, Serialize)]
    pub struct ValveResult {
        pub label: String,
        // Flattened so the JSON is a single-level `{ label, status, code? }`
        // rather than nesting ValveStatus's own internal "status" tag
        // inside a field that's *also* called "status".
        #[serde(flatten)]
        pub status: ValveStatus,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Serialize)]
    #[serde(rename_all = "snake_case")]
    pub enum MotorStatus {
        Ok,
        WarningLow,
        WarningOver,
        WarningOther,
        /// A `Current:` reading arrived with no adjacent MOT.ABS OK/Warning
        /// line to anchor it. The original's own `SendReport` falls back
        /// to whatever motor status it last knew in this exact case —
        /// which is a genuinely weak signal on the *original's* part, not
        /// a bug introduced here: a current reading alone was never meant
        /// to stand as its own confirmation.
        Unconfirmed,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Serialize)]
    pub struct MotorResult {
        pub status: MotorStatus,
        pub current_amps: Option<f64>,
    }

    #[derive(Debug, Clone, PartialEq, Serialize)]
    pub struct PressureCycle {
        pub label: String,
        /// Whether "Ok" appeared on this cycle's own header line.
        pub passed: bool,
        pub channel_pressures: [Option<f64>; 4],
        pub pump_pressure: Option<f64>,
        /// Distinct channel numbers (1-4) flagged with a board-appended
        /// error suffix *within this specific cycle* — see
        /// PressureTestResult::faulted_channels for the format. Kept
        /// per-cycle (not just the flat aggregate below) so the repair
        /// flow can tell *which named test phase* a fault came from —
        /// the "channel pressure should track pump pressure" check that
        /// detects a fixed outlet only makes sense for an "outlet test"
        /// cycle specifically, not e.g. a "Braked wheels test" cycle
        /// where high channel pressure is the expected/normal reading.
        pub faulted_channels: Vec<u8>,
    }

    #[derive(Debug, Clone, PartialEq, Serialize)]
    pub struct PressureTestResult {
        pub cycles: Vec<PressureCycle>,
        /// `None` means the board never sent a final `Pressure Ok`/
        /// `Pressure NOT Ok` line at all — per `SendReport`, that line is
        /// only ever sent as the very last thing after a complete run, so
        /// its absence almost always means a protection fault (e.g. high
        /// pressure) cut the test short partway through, not that it
        /// failed outright. `Some(true/false)` is the literal verdict the
        /// board did send.
        pub completed: Option<bool>,
        /// Distinct channel numbers (1-4) whose "Channel Pressure N = X
        /// Bar" line carried a board-appended "error" suffix (e.g.
        /// "Channel Pressure 4 = 201.9 Bar - error!!") — confirmed
        /// against the decompiled SendReport(), which only ever reads the
        /// substring between "=" and "Bar" and ignores anything past it,
        /// so this is genuine board text, not something the original PC
        /// app adds. Lets the automated repair flow target a "Programs
        /// Cycle" reload at the exact Test/Channel that's actually broken
        /// instead of re-running an untargeted Cycle.
        pub faulted_channels: Vec<u8>,
    }

    #[derive(Debug, Clone, Default, PartialEq, Serialize)]
    pub struct ParsedReport {
        pub valves: Vec<ValveResult>,
        pub motor: Option<MotorResult>,
        pub pressure: Option<PressureTestResult>,
    }

    fn parse_bar_value(s: &str) -> Option<f64> {
        s.trim().replace(',', ".").parse::<f64>().ok()
    }

    /// Parses accumulated `Report:` text (already control-char-decoded to
    /// real newlines, see `parse_line`'s `"Report"` case) into structured
    /// per-test results.
    ///
    /// `text` accumulates across however many times a test actually ran
    /// (`ReportBuffer += text3` in the original — see the frontend's
    /// `hydraulic_report` handling) — running Valve testing twice means
    /// two full sets of "Valve N: ..." lines are present. Rather than list
    /// the same valve twice, each one's *latest* line wins; a valve that
    /// showed a Fault on the first pass but reads clean on a re-run should
    /// show as clean, not still flagged from a stale first attempt.
    pub fn parse_report(text: &str) -> ParsedReport {
        let mut valves: Vec<ValveResult> = Vec::new();
        let mut valve_index: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        let mut motor: Option<MotorResult> = None;
        let mut last_motor_status: Option<MotorStatus> = None;
        let mut cycles: Vec<PressureCycle> = Vec::new();
        let mut current_cycle: Option<PressureCycle> = None;
        let mut completed: Option<bool> = None;
        let mut faulted_channels: Vec<u8> = Vec::new();

        for raw_line in text.lines() {
            let line = raw_line.trim();
            if line.is_empty() {
                continue;
            }

            // Valve resistance-check line: "Valve N: ..." (never the
            // "Valve closure ..." variant, which the original also treats
            // as plain unhighlighted text).
            if line.starts_with("Valve") && !line.contains("closure") {
                let status = line
                    .contains("Fault")
                    .then(|| line.find(';'))
                    .flatten()
                    .and_then(|semi| line[semi + 1..].trim().parse::<u8>().ok())
                    .map(|code| {
                        if code <= 10 {
                            ValveStatus::Fault { code }
                        } else if code <= 15 {
                            ValveStatus::Marginal { code }
                        } else {
                            ValveStatus::Informational { code }
                        }
                    })
                    .unwrap_or(ValveStatus::Ok);

                // Dedup key is everything before the first ":" — "Valve 3"
                // out of "Valve 3: Fault;5" — so a later re-run's line for
                // the same valve overwrites this one in place instead of
                // appending a duplicate.
                let key = line.split(':').next().unwrap_or(line).trim().to_string();
                let result = ValveResult { label: line.to_string(), status };
                match valve_index.get(&key) {
                    Some(&idx) => valves[idx] = result,
                    None => {
                        valve_index.insert(key, valves.len());
                        valves.push(result);
                    }
                }
                continue;
            }

            // Motor status line.
            if line.contains("MOT.ABS") {
                let status = if line.contains("OK") {
                    MotorStatus::Ok
                } else if line.contains("Warning:") {
                    if line.contains("Low") {
                        MotorStatus::WarningLow
                    } else if line.contains("Over") {
                        MotorStatus::WarningOver
                    } else {
                        MotorStatus::WarningOther
                    }
                } else {
                    continue;
                };
                last_motor_status = Some(status);
                motor = Some(MotorResult {
                    status,
                    current_amps: motor.and_then(|m| m.current_amps),
                });
                continue;
            }
            if let Some(idx) = line.find("Current:") {
                let raw = &line[idx + "Current:".len()..].replace('A', "");
                let amps = parse_bar_value(raw);
                let status = last_motor_status.unwrap_or(MotorStatus::Unconfirmed);
                motor = Some(MotorResult { status, current_amps: amps });
                continue;
            }

            // Pressure-cycle header. Two confirmed shapes share this role:
            //  - A repeated-cycle counter, "<digit>) ..." — what the
            //    "Cycle" test (H-CYCLES) sends for each repetition.
            //  - A named test phase, "<name>: Ok" / "<name>: ERROR" — what
            //    the "Hydraulic Test" (PRESSURE) sequence sends instead,
            //    e.g. "Oil outlet test: Ok", "Valve closure sealing test:
            //    Ok", "Braked wheels test: ERROR" (confirmed against a
            //    real report; other trailing result words for this second
            //    shape aren't confirmed yet). Without recognizing this
            //    second shape too, every Channel/Pump Pressure line that
            //    follows one has no cycle to attach to and is silently
            //    dropped — including the per-channel error suffix below.
            let bytes = line.as_bytes();
            let is_numbered_header = bytes.len() > 1 && bytes[0].is_ascii_digit() && bytes[1] == b')';
            let is_named_header = !is_numbered_header && (line.ends_with(": Ok") || line.ends_with(": ERROR"));
            if is_numbered_header || is_named_header {
                if let Some(c) = current_cycle.take() {
                    cycles.push(c);
                }
                // "Ok" alone isn't enough — "NOT Ok" also contains "Ok" as
                // a substring, which previously mis-marked a hypothetical
                // failed numbered header as passed.
                let passed = line.contains("Ok") && !line.contains("NOT Ok") && !line.contains("ERROR");
                current_cycle = Some(PressureCycle {
                    label: line.to_string(),
                    passed,
                    channel_pressures: [None; 4],
                    pump_pressure: None,
                    faulted_channels: Vec::new(),
                });
                continue;
            }
            if let Some(idx) = line.find("Channel Pressure") {
                if let (Some(eq), Some(bar)) = (line.find('='), line.find("Bar")) {
                    let channel_digit = line[idx + "Channel Pressure".len()..eq]
                        .chars()
                        .rev()
                        .find(|c| c.is_ascii_digit())
                        .and_then(|c| c.to_digit(10));
                    let value = parse_bar_value(&line[eq + 1..bar]);
                    if let (Some(n @ 1..=4), Some(v), Some(cycle)) =
                        (channel_digit, value, current_cycle.as_mut())
                    {
                        cycle.channel_pressures[(n - 1) as usize] = Some(v);
                        // The board appends " - error!!" (wording not
                        // pinned down further than that) straight onto
                        // this same line when the channel is out of spec
                        // — confirmed against the decompiled SendReport()
                        // (FormHydraulicBench.cs), which only ever reads
                        // the substring between "=" and "Bar" for the
                        // value and never looks at anything past it, so
                        // this suffix is genuinely board text, not
                        // something the original PC app adds or reacts
                        // to. Lets the automated repair flow target a
                        // "Programs Cycle" reload at the exact
                        // Test/Channel that's actually broken instead of
                        // re-running an untargeted Cycle.
                        if line.to_ascii_lowercase().contains("error") {
                            let ch = n as u8;
                            if !cycle.faulted_channels.contains(&ch) {
                                cycle.faulted_channels.push(ch);
                            }
                            if !faulted_channels.contains(&ch) {
                                faulted_channels.push(ch);
                            }
                        }
                    }
                }
                continue;
            }
            if line.contains("Pump Pressure") {
                if let (Some(eq), Some(bar)) = (line.find('='), line.find("Bar")) {
                    if let Some(cycle) = current_cycle.as_mut() {
                        cycle.pump_pressure = parse_bar_value(&line[eq + 1..bar]);
                    }
                }
                continue;
            }
            if line.contains("Pressure Ok") || line.contains("Pressure NOT Ok") {
                completed = Some(!line.contains("NOT"));
                continue;
            }
        }
        if let Some(c) = current_cycle.take() {
            cycles.push(c);
        }

        let pressure = if !cycles.is_empty() || completed.is_some() || !faulted_channels.is_empty() {
            Some(PressureTestResult { cycles, completed, faulted_channels })
        } else {
            None
        };

        ParsedReport { valves, motor, pressure }
    }
}

// ============================================================
// Sensor bench — FormSensor.cs (rides the Hydraulic board's COM channel)
// ============================================================
pub mod sensor {
    use serde::Deserialize;

    #[derive(Debug, Clone, PartialEq, Deserialize)]
    #[serde(tag = "action", rename_all = "snake_case")]
    pub enum Command {
        EnableStatus,
        DisableStatus,
        EnableSensorTest,
        DisableSensorTest,
        Pump { on: bool },
        EmptyChannel,
    }

    impl Command {
        pub fn to_frame(&self) -> String {
            use Command::*;
            match self {
                EnableStatus => "ENABLESTATUS".to_string(),
                DisableStatus => "DISABLESTATUS".to_string(),
                EnableSensorTest => "H-ENABLESENSORTEST".to_string(),
                DisableSensorTest => "H-DISABLESENSORTEST".to_string(),
                Pump { on } => format!("Pompa:{}", if *on { "ON" } else { "OFF" }),
                EmptyChannel => "H-EMPTYCHANNEL".to_string(),
            }
        }
    }
}

// ============================================================
// Washing — FormWashing.cs `BufferTX` queue (plain text)
// ============================================================
pub mod washing {
    use serde::Deserialize;

    #[derive(Debug, Clone, PartialEq, Deserialize)]
    #[serde(tag = "action", rename_all = "snake_case")]
    pub enum Command {
        GetModel,
        AckWashing,
        RunCycle,
        /// Cycle parameters are uploaded as JSON (`ParametriCiclo` /
        /// `Parametri` / `Salva`, serialized with .NET's
        /// `JavaScriptSerializer`) rather than a keyword command — pass the
        /// JSON payload straight through.
        RawJsonPayload { json: String },
    }

    impl Command {
        pub fn to_frame(&self) -> String {
            use Command::*;
            match self {
                GetModel => "W-GETMODEL".to_string(),
                AckWashing => "ACK WASHING".to_string(),
                RunCycle => "W-CYCLE".to_string(),
                RawJsonPayload { json } => json.clone(),
            }
        }
    }
}

// ============================================================
// Response parsing — shared across boards
// ============================================================

/// A parsed board response line. Unrecognized `Key` / `Key:Value` lines
/// fall back to `Raw` rather than being dropped, so the UI can still show
/// them and the vocabulary can grow without breaking existing callers.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum F2EvoEvent {
    /// "Hydraulics" / "Electronics" / "WASHING" discovery broadcast from a
    /// board that hasn't been claimed yet.
    DiscoveryBroadcast { board: String },
    /// "ACK Hydraulics" / "ACK Electronics" / "ACK WASHING"
    Ack { board: String },
    Volt { volts: f64 },
    Current { amps: f64 },
    Comunication { state: String },
    Frequency { raw: String },
    /// 39-field `;`-joined Hydraulic Bench status telemetry. `telemetry` is
    /// `None` if the frame didn't decode cleanly (wrong field count, or a
    /// required numeric field wasn't parseable) — `fields` is always kept
    /// so the raw data is still visible even then.
    HydraulicStatus {
        fields: Vec<String>,
        telemetry: Option<hydraulic::Telemetry>,
    },
    /// Multi-line Hydraulic Bench report; 0x04/0x05 control-char separators
    /// decoded to CR/CRLF (`FormHydraulicBench.Handle_DataReceived`,
    /// `case "Report"`).
    HydraulicReport { text: String },
    Warning { text: String },
    Diagnostic { text: String },
    SerialNumber { value: String },
    /// `Model:<status>;<param>` — mirrors `FormHydraulicBench.NameABS`'s
    /// `text.Split(';')[0]` / `[1]` split. `status` is `"NONE"` (no unit
    /// mounted), `"Load program"` (unit detected, `param` is the numeric
    /// `CodiceABS` to look up), or occasionally already a resolved name
    /// with no `param`.
    Model { status: String, param: Option<String> },
    Mem { free: String },
    TestFailed { channel: String, test: String },
    Ok,
    /// Literal `ABS caricato.` — the board's final line after echoing back
    /// every field it parsed from a "load program" upload
    /// (`FormHydraulicData.cs`'s `Handle_DataReceived`, `case "ABS
    /// caricato.":`). The original gates OK/Error on its own PC-side
    /// field-by-field echo comparison (`CheckData`), which isn't replicated
    /// here (see `hydraulic_import::build_abs_upload`'s doc comment) — this
    /// event alone is treated as "upload finished" by the caller.
    AbsCaricato,
    /// Generic fallback: `Key` alone, or `Key:Value` split on the first
    /// colon (matches `DataUart[n].Split(':')` in the original app, which
    /// only ever looks at the first segment).
    Raw { key: String, value: Option<String> },
}

/// Parses one already-line-delimited response, e.g. what arrives via the
/// `serial-data` event. Mirrors `MainMenuForm`/`ABS`/`Cambi`/
/// `FormHydraulicBench`/`FormSensor`/`FormWashing`'s `Handle_DataReceived`,
/// which all split incoming text on the first `:` and switch on the key.
pub fn parse_line(line: &str) -> F2EvoEvent {
    let line = line.trim();

    if let Some(board) = line.strip_prefix("ACK ") {
        return F2EvoEvent::Ack {
            board: board.to_string(),
        };
    }
    if matches!(line, "Hydraulics" | "Electronics" | "WASHING") {
        return F2EvoEvent::DiscoveryBroadcast {
            board: line.to_string(),
        };
    }
    if line == "OK" {
        return F2EvoEvent::Ok;
    }
    if line == "ABS caricato." {
        return F2EvoEvent::AbsCaricato;
    }

    let (key, value) = match line.split_once(':') {
        Some((k, v)) => (k, Some(v.trim())),
        None => (line, None),
    };

    match key {
        "Volt" => value
            .and_then(|v| v.parse::<f64>().ok())
            .map(|raw| F2EvoEvent::Volt {
                volts: raw * VOLT_SCALE,
            })
            .unwrap_or_else(|| raw_event(key, value)),
        "Current" => value
            .and_then(|v| v.parse::<f64>().ok())
            .map(|raw| F2EvoEvent::Current {
                amps: raw * CURRENT_SCALE,
            })
            .unwrap_or_else(|| raw_event(key, value)),
        "Comunication" => F2EvoEvent::Comunication {
            state: value.unwrap_or_default().to_string(),
        },
        "Frequency" => F2EvoEvent::Frequency {
            raw: value.unwrap_or_default().to_string(),
        },
        "Status" => {
            let fields: Vec<String> = value
                .unwrap_or_default()
                .split(';')
                .map(|s| s.to_string())
                .collect();
            let telemetry = hydraulic::parse_status(&fields);
            F2EvoEvent::HydraulicStatus { fields, telemetry }
        }
        "Report" => {
            // Matches FormHydraulicBench.Handle_DataReceived's decode of the
            // Report frame's control-character separators.
            let text = value
                .unwrap_or_default()
                .replace('\u{4}', "\r")
                .replace('\u{5}', "\r\n");
            F2EvoEvent::HydraulicReport { text }
        }
        "Warning" => F2EvoEvent::Warning {
            text: value.unwrap_or_default().to_string(),
        },
        "Diagnostic" => F2EvoEvent::Diagnostic {
            text: value.unwrap_or_default().to_string(),
        },
        "Serial Number" => F2EvoEvent::SerialNumber {
            value: value.unwrap_or_default().to_string(),
        },
        "Model" | "ModelABS" => {
            let raw = value.unwrap_or_default();
            let mut parts = raw.splitn(2, ';');
            let status = parts.next().unwrap_or_default().to_string();
            let param = parts.next().map(|s| s.to_string());
            F2EvoEvent::Model { status, param }
        }
        "Mem" => F2EvoEvent::Mem {
            free: value.unwrap_or_default().to_string(),
        },
        "Test failed" => {
            let parts: Vec<&str> = value.unwrap_or_default().split(';').collect();
            F2EvoEvent::TestFailed {
                channel: parts.first().unwrap_or(&"").to_string(),
                test: parts.get(1).unwrap_or(&"").to_string(),
            }
        }
        _ => raw_event(key, value),
    }
}

fn raw_event(key: &str, value: Option<&str>) -> F2EvoEvent {
    F2EvoEvent::Raw {
        key: key.to_string(),
        value: value.map(|s| s.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn electronics_frames_are_stx_prefixed() {
        assert_eq!(
            electronics::Command::SetRelay { on: true }.to_frame(),
            "\u{2}Set Rele ON"
        );
        assert_eq!(
            electronics::Command::Frequency { hz: 50 }.to_frame(),
            "\u{2}Frequency:50Hz"
        );
        assert_eq!(
            electronics::Command::SelectOut { channel: 2 }.to_frame(),
            "\u{2}Select OUT:2"
        );
    }

    #[test]
    fn ack_electronics_has_no_stx() {
        // ABS.cs:909 enqueues this bare, bypassing InviaComando's STX prefix.
        assert_eq!(
            electronics::Command::AckElectronics.to_frame(),
            "ACK Electronics"
        );
    }

    #[test]
    fn gearbox_frames_are_plain() {
        assert_eq!(gearbox::Command::SetGearbox.to_frame(), "Set GEARBOX");
        assert_eq!(
            gearbox::Command::SetPositionD.to_frame(),
            "Set Position D"
        );
    }

    #[test]
    fn hydraulic_frames_match_original_keywords() {
        assert_eq!(hydraulic::Command::GetModel.to_frame(), "H-GETMODEL");
        assert_eq!(hydraulic::Command::Unlock { channel: 3 }.to_frame(), "UNLOCK:3");
    }

    #[test]
    fn parses_volt_with_known_scale() {
        // 1024 raw counts -> ~15.0 V, matches the *0.0146484375 conversion
        // in ABS.Handle_DataReceived.
        match parse_line("Volt:1024") {
            F2EvoEvent::Volt { volts } => assert!((volts - 15.0).abs() < 0.001),
            other => panic!("expected Volt, got {other:?}"),
        }
    }

    #[test]
    fn parses_current_with_known_scale() {
        match parse_line("Current:100") {
            F2EvoEvent::Current { amps } => assert!((amps - 6.103515625).abs() < 0.0001),
            other => panic!("expected Current, got {other:?}"),
        }
    }

    #[test]
    fn parses_model_status_and_param() {
        assert_eq!(
            parse_line("Model:NONE"),
            F2EvoEvent::Model { status: "NONE".to_string(), param: None }
        );
        assert_eq!(
            parse_line("Model:Load program;47"),
            F2EvoEvent::Model { status: "Load program".to_string(), param: Some("47".to_string()) }
        );
    }

    #[test]
    fn parses_abs_caricato_completion_line() {
        assert_eq!(parse_line("ABS caricato."), F2EvoEvent::AbsCaricato);
    }

    #[test]
    fn raw_json_payload_passes_through_unmodified() {
        let json = r#"{"Model":"5.4B mercedes-benz sw","C_Max":8.0}"#;
        assert_eq!(
            hydraulic::Command::RawJsonPayload { json: json.to_string() }.to_frame(),
            json
        );
    }

    #[test]
    fn parses_discovery_and_ack() {
        assert_eq!(
            parse_line("Hydraulics"),
            F2EvoEvent::DiscoveryBroadcast {
                board: "Hydraulics".to_string()
            }
        );
        assert_eq!(
            parse_line("ACK WASHING"),
            F2EvoEvent::Ack {
                board: "WASHING".to_string()
            }
        );
    }

    #[test]
    fn parses_hydraulic_status_frame_fields() {
        let line = format!("Status:{}", vec!["0"; hydraulic::STATUS_FIELD_COUNT].join(";"));
        match parse_line(&line) {
            F2EvoEvent::HydraulicStatus { fields, .. } => {
                assert_eq!(fields.len(), hydraulic::STATUS_FIELD_COUNT)
            }
            other => panic!("expected HydraulicStatus, got {other:?}"),
        }
    }

    #[test]
    fn parses_real_idle_status_frame_with_37_fields() {
        // Captured from a real ATE MK100 bench, idle with no ABS model
        // loaded — 37 fields, not the 39 the decompiled source's
        // `array.Length == 39` check assumes. Front fields (pump/channel
        // pressures, current, temperature, ready state) must still parse.
        let line = "Status:0.13;0.98;0.13;0.56;1.41;0.43;32.94;Error;0;0;0;0;0;-8;1;1;1;1;1;0;0;8;0;0;0;0;2.30;70.00;0;1;0.98;1.83;1.41;0.56;513-1020;0;-1";
        match parse_line(line) {
            F2EvoEvent::HydraulicStatus { fields, telemetry } => {
                assert_eq!(fields.len(), 37);
                let t = telemetry.expect("should still decode a short frame");
                assert_eq!(t.pump_pressure, 0.13);
                assert_eq!(t.channel1.primary, 0.98);
                assert_eq!(t.channel2.primary, 0.13);
                assert_eq!(t.channel3.primary, 0.56);
                assert_eq!(t.channel4.primary, 1.41);
                assert_eq!(t.current_amps, 0.43);
                assert_eq!(t.temperature_c, 32.94);
                assert_eq!(t.ready_state, "Error");
            }
            other => panic!("expected HydraulicStatus, got {other:?}"),
        }
    }

    #[test]
    fn parses_hydraulic_status_telemetry() {
        // Mirrors the bench in the screenshot: pump 51, channels 3/2/1/1,
        // current 6.5A, temperature 36°, oil ok (green), 0% progress.
        let mut fields = vec!["0".to_string(); hydraulic::STATUS_FIELD_COUNT];
        fields[0] = "51".to_string(); // pump
        fields[1] = "3".to_string(); // channel1
        fields[2] = "2".to_string(); // channel2
        fields[3] = "1".to_string(); // channel3
        fields[4] = "1".to_string(); // channel4
        fields[5] = "6.5".to_string(); // current
        fields[6] = "36".to_string(); // temperature
        fields[7] = "Ready".to_string();
        fields[19] = "0".to_string(); // no protection faults
        fields[20] = "0".to_string(); // progress value
        fields[21] = "100".to_string(); // progress max
        fields[27] = "2".to_string(); // oil level -> Ok
        fields[38] = "-1".to_string(); // no valve under test

        let telemetry = hydraulic::parse_status(&fields).expect("should decode");
        assert_eq!(telemetry.pump_pressure, 51.0);
        assert_eq!(telemetry.channel1.primary, 3.0);
        assert_eq!(telemetry.channel2.primary, 2.0);
        assert_eq!(telemetry.channel3.primary, 1.0);
        assert_eq!(telemetry.channel4.primary, 1.0);
        assert_eq!(telemetry.current_amps, 6.5);
        assert_eq!(telemetry.temperature_c, 36.0);
        assert_eq!(telemetry.ready_state, "Ready");
        assert_eq!(telemetry.progress_percent, 0.0);
        assert_eq!(telemetry.oil_status, hydraulic::OilStatus::Ok);
        assert!(telemetry.protection_faults.is_empty());
        assert_eq!(telemetry.valve_under_test, -1);
    }

    #[test]
    fn decodes_protection_fault_bits() {
        let mut fields = vec!["0".to_string(); hydraulic::STATUS_FIELD_COUNT];
        fields[0] = "0".to_string();
        fields[1] = "0".to_string();
        fields[2] = "0".to_string();
        fields[3] = "0".to_string();
        fields[4] = "0".to_string();
        fields[5] = "0".to_string();
        fields[6] = "0".to_string();
        fields[7] = "Error".to_string();
        fields[19] = (0x40 | 0x04).to_string(); // Pressure loss + Refill the oil!
        fields[20] = "0".to_string();
        fields[21] = "1".to_string();
        fields[38] = "-1".to_string();

        let telemetry = hydraulic::parse_status(&fields).expect("should decode");
        assert_eq!(
            telemetry.protection_faults,
            vec!["Pressure loss.".to_string(), "Refill the oil! ...".to_string()]
        );
    }

    #[test]
    fn oil_status_thresholds_match_original_ui() {
        // RefreshFloater: >1.5 lime, >0.5 yellow, else red.
        let mut fields = vec!["0".to_string(); hydraulic::STATUS_FIELD_COUNT];
        fields[7] = "Ready".to_string();
        fields[21] = "1".to_string();
        fields[38] = "-1".to_string();

        fields[27] = "2.0".to_string();
        assert_eq!(
            hydraulic::parse_status(&fields).unwrap().oil_status,
            hydraulic::OilStatus::Ok
        );
        fields[27] = "1.0".to_string();
        assert_eq!(
            hydraulic::parse_status(&fields).unwrap().oil_status,
            hydraulic::OilStatus::Low
        );
        fields[27] = "0.0".to_string();
        assert_eq!(
            hydraulic::parse_status(&fields).unwrap().oil_status,
            hydraulic::OilStatus::Critical
        );
    }

    #[test]
    fn parses_report_control_chars() {
        match parse_line("Report:1) Test:OK\u{4}2) Test:FAIL\u{5}") {
            F2EvoEvent::HydraulicReport { text } => {
                assert_eq!(text, "1) Test:OK\r2) Test:FAIL\r\n")
            }
            other => panic!("expected HydraulicReport, got {other:?}"),
        }
    }

    #[test]
    fn unknown_line_falls_back_to_raw() {
        assert_eq!(
            parse_line("SomethingNew:42"),
            F2EvoEvent::Raw {
                key: "SomethingNew".to_string(),
                value: Some("42".to_string())
            }
        );
    }

    // ---- hydraulic::parse_report ----

    #[test]
    fn valve_fault_severity_thresholds_match_original_colors() {
        let report = "Valve 1: Fault;5\nValve 2: Fault;12\nValve 3: Fault;20\nValve 4: OK";
        let parsed = hydraulic::parse_report(report);
        assert_eq!(parsed.valves.len(), 4);
        assert_eq!(parsed.valves[0].status, hydraulic::ValveStatus::Fault { code: 5 });
        assert_eq!(parsed.valves[1].status, hydraulic::ValveStatus::Marginal { code: 12 });
        assert_eq!(parsed.valves[2].status, hydraulic::ValveStatus::Informational { code: 20 });
        assert_eq!(parsed.valves[3].status, hydraulic::ValveStatus::Ok);
    }

    #[test]
    fn repeated_valve_line_updates_in_place_instead_of_duplicating() {
        // Same valve tested twice (e.g. the operator re-ran Valve testing)
        // — the second, cleaner reading should replace the first, not sit
        // alongside it as a second entry.
        let report = "Valve 1: Fault;5\nValve 2: OK\nValve 1: OK";
        let parsed = hydraulic::parse_report(report);
        assert_eq!(parsed.valves.len(), 2);
        assert_eq!(parsed.valves[0].label, "Valve 1: OK");
        assert_eq!(parsed.valves[0].status, hydraulic::ValveStatus::Ok);
        assert_eq!(parsed.valves[1].label, "Valve 2: OK");
    }

    #[test]
    fn valve_closure_lines_are_not_treated_as_valve_results() {
        // The original's ReportOpen explicitly excludes "closure" lines
        // from the per-valve coloring logic (plain text instead).
        let parsed = hydraulic::parse_report("Valve closure test\nValve 1: OK");
        assert_eq!(parsed.valves.len(), 1);
        assert_eq!(parsed.valves[0].label, "Valve 1: OK");
    }

    #[test]
    fn motor_ok_line_sets_clean_status() {
        let parsed = hydraulic::parse_report("1) MOT.ABS OK\nCurrent: 2.35 A");
        let motor = parsed.motor.expect("motor result");
        assert_eq!(motor.status, hydraulic::MotorStatus::Ok);
        assert_eq!(motor.current_amps, Some(2.35));
    }

    #[test]
    fn motor_warning_low_and_over_are_distinguished() {
        let low = hydraulic::parse_report("1) MOT.ABS Warning: Low current").motor.unwrap();
        assert_eq!(low.status, hydraulic::MotorStatus::WarningLow);
        let over = hydraulic::parse_report("1) MOT.ABS Warning: Overcurrent").motor.unwrap();
        assert_eq!(over.status, hydraulic::MotorStatus::WarningOver);
    }

    #[test]
    fn current_reading_with_no_adjacent_motor_line_is_unconfirmed() {
        // Matches the original's own SendReport ambiguity: a bare
        // Current: line with nothing anchoring it isn't a real pass/fail
        // signal, just a number.
        let motor = hydraulic::parse_report("Current: 1.80 A").motor.unwrap();
        assert_eq!(motor.status, hydraulic::MotorStatus::Unconfirmed);
        assert_eq!(motor.current_amps, Some(1.80));
    }

    #[test]
    fn pressure_cycle_parses_channels_and_pump_with_comma_or_dot_decimals() {
        let report = "\
1) Hydraulic Test: Ok
Channel Pressure 1 = 12.34 Bar
Channel Pressure 2 = 45,67 Bar
Channel Pressure 3 = 0.00 Bar
Channel Pressure 4 = 8.90 Bar
Pump Pressure = 100.00 Bar
Pressure Ok";
        let parsed = hydraulic::parse_report(report);
        let pressure = parsed.pressure.expect("pressure result");
        assert_eq!(pressure.cycles.len(), 1);
        let cycle = &pressure.cycles[0];
        assert!(cycle.passed);
        assert_eq!(cycle.channel_pressures, [Some(12.34), Some(45.67), Some(0.00), Some(8.90)]);
        assert_eq!(cycle.pump_pressure, Some(100.00));
        assert_eq!(pressure.completed, Some(true));
    }

    #[test]
    fn multiple_pressure_cycles_are_split_correctly() {
        let report = "\
1) First: Ok
Channel Pressure 1 = 10.00 Bar
Pump Pressure = 50.00 Bar
2) Second: Ok
Channel Pressure 1 = 20.00 Bar
Pump Pressure = 60.00 Bar
Pressure Ok";
        let pressure = hydraulic::parse_report(report).pressure.unwrap();
        assert_eq!(pressure.cycles.len(), 2);
        assert_eq!(pressure.cycles[0].pump_pressure, Some(50.00));
        assert_eq!(pressure.cycles[1].pump_pressure, Some(60.00));
    }

    #[test]
    fn missing_final_line_means_test_did_not_complete() {
        // No "Pressure Ok"/"Pressure NOT Ok" line at all — e.g. a
        // protection fault (high pressure) cut the test short before it
        // reached its final summary, per SendReport only ever sending
        // that line as the very last step of a full run.
        let report = "1) Cycle: Ok\nChannel Pressure 1 = 5.00 Bar\nPump Pressure = 20.00 Bar";
        let pressure = hydraulic::parse_report(report).pressure.unwrap();
        assert_eq!(pressure.cycles.len(), 1);
        assert_eq!(pressure.completed, None);
    }

    #[test]
    fn pressure_not_ok_is_distinguished_from_missing() {
        let report = "1) Cycle: Ok\nPressure NOT Ok";
        let pressure = hydraulic::parse_report(report).pressure.unwrap();
        assert_eq!(pressure.completed, Some(false));
    }

    #[test]
    fn bleeding_never_produces_any_report_data() {
        // Confirmed against the decompiled source: SendReport has no code
        // path that reacts to a Bleeding line at all.
        let parsed = hydraulic::parse_report("Bleeding started\nBleeding complete");
        assert!(parsed.valves.is_empty());
        assert!(parsed.motor.is_none());
        assert!(parsed.pressure.is_none());
    }

    #[test]
    fn channel_pressure_error_suffix_is_captured_and_deduped() {
        let report = "1) Cycle: Ok\nChannel Pressure 4 = 201.9 Bar - error!!\nChannel Pressure 3 = 10.00 Bar\nChannel Pressure 4 = 205.0 Bar - error!!\nPressure NOT Ok";
        let pressure = hydraulic::parse_report(report).pressure.unwrap();
        assert_eq!(pressure.faulted_channels, vec![4]);
        // The value itself still parses correctly regardless of the
        // trailing suffix — matches SendReport() only ever reading the
        // substring between "=" and "Bar".
        assert_eq!(pressure.cycles[0].channel_pressures[3], Some(205.0));
    }

    #[test]
    fn plain_channel_pressure_line_is_not_mistaken_for_a_fault() {
        // "Channel Pressure N = ..." with no "error" suffix is the normal
        // in-spec reading and must not be flagged.
        let report = "1) Cycle: Ok\nChannel Pressure 1 = 10.00 Bar\nPressure Ok";
        let pressure = hydraulic::parse_report(report).pressure.unwrap();
        assert!(pressure.faulted_channels.is_empty());
    }

    #[test]
    fn named_test_phase_header_starts_a_new_cycle() {
        // Real Hydraulic Test report ("174460 avant.pdf") — three named
        // phases ("Oil outlet test", "Valve closure sealing test",
        // "Braked wheels test"), not the numbered "<digit>)" counter the
        // "Cycle" test uses. Before recognizing this shape, every
        // Channel/Pump Pressure line here had no active cycle to attach
        // to and was silently dropped — including the faulted_channels
        // detection.
        let report = "\
Valve1: Ok
Valve2: Ok
Valve12: Fault
MOT.ABS OK
Current: 2.5A
Oil outlet test: Ok
Pump Pressure = 58.3 Bar
Channel Pressure 1 = 60.0 Bar
Channel Pressure 2 = 58.3 Bar
Channel Pressure 3 = 59.2 Bar
Channel Pressure 4 = 59.2 Bar
Valve closure sealing test: Ok
Pump Pressure = 59.0 Bar
Channel Pressure 1 = 2.3 Bar
Channel Pressure 2 = 0.6 Bar
Channel Pressure 3 = 1.0 Bar
Channel Pressure 4 = 1.4 Bar
Warning: Locked wheel.
Braked wheels test: ERROR
Pump Pressure = 59.2 Bar
Channel Pressure 1 = 193.4 Bar
Channel Pressure 2 = 190.4 Bar
Channel Pressure 3 = 194.7 Bar
Channel Pressure 4 = 201.9 Bar - error!!
Pressure NOT Ok";
        let parsed = hydraulic::parse_report(report);

        // Valve12's bare "Fault" (no ";code") reads as Ok here — this
        // faithfully matches the decompiled ReportOpen()'s own display
        // logic (`if (Fault && has ';') { colored by code } else {
        // Green }`), and real board wire text is expected to always
        // include a code; a codeless "Fault" only shows up here because
        // ReportOpen() strips the code from what non-admin users see for
        // Red/Informational severities, which is a display-layer
        // transform, not something our own captured wire text should
        // ever exhibit.
        assert_eq!(parsed.valves[2].status, hydraulic::ValveStatus::Ok);

        let pressure = parsed.pressure.unwrap();
        assert_eq!(pressure.cycles.len(), 3);
        assert!(pressure.cycles[0].passed);
        assert!(pressure.cycles[1].passed);
        assert!(!pressure.cycles[2].passed);
        assert_eq!(pressure.cycles[2].channel_pressures, [Some(193.4), Some(190.4), Some(194.7), Some(201.9)]);
        assert_eq!(pressure.faulted_channels, vec![4]);
        assert_eq!(pressure.completed, Some(false));

        // Attribution matters for the repair flow: the fault must be
        // scoped to the "Braked wheels test" cycle it actually occurred
        // in, not leak onto the earlier, genuinely clean "Oil outlet
        // test" cycle — that distinction is what lets the repair flow
        // decide whether the "channel pressure should track pump
        // pressure" recovery check even applies.
        assert!(pressure.cycles[0].faulted_channels.is_empty());
        assert!(pressure.cycles[1].faulted_channels.is_empty());
        assert_eq!(pressure.cycles[2].faulted_channels, vec![4]);
    }
}

// ============================================================
// Tauri commands
// ============================================================

use crate::AppState;
use tauri::State;

/// Sends the frame and returns it so the caller can log exactly what went
/// out on the wire (there's no separate TX echo from the board).
async fn send(state: &State<'_, AppState>, frame: String) -> Result<String, String> {
    let conn = state.serial_connection.lock().await;
    conn.send_message(format!("{frame}\n"))?;
    Ok(frame)
}

// The argument is named `command`, not `cmd` — Tauri's own invoke()
// envelope has a top-level `cmd` field it uses to route to the right Rust
// function (`{ cmd: "f2evo_hydraulic_send", ...args }`). An argument also
// named `cmd` collides with it: `...args` spreads over Tauri's own `cmd`,
// silently corrupting the routing envelope. The Rust side then fails to
// parse it ("invalid type: map, expected a string") before ever reaching
// this function, and the JS-side promise never resolves or rejects — it
// just hangs forever, which is exactly what made this so confusing to
// track down without devtools.
#[tauri::command]
pub async fn f2evo_electronics_send(
    command: electronics::Command,
    state: State<'_, AppState>,
) -> Result<String, String> {
    send(&state, command.to_frame()).await
}

#[tauri::command]
pub async fn f2evo_gearbox_send(
    command: gearbox::Command,
    state: State<'_, AppState>,
) -> Result<String, String> {
    send(&state, command.to_frame()).await
}

#[tauri::command]
pub async fn f2evo_hydraulic_send(
    command: hydraulic::Command,
    state: State<'_, AppState>,
) -> Result<String, String> {
    send(&state, command.to_frame()).await
}

#[tauri::command]
pub async fn f2evo_sensor_send(
    command: sensor::Command,
    state: State<'_, AppState>,
) -> Result<String, String> {
    send(&state, command.to_frame()).await
}

#[tauri::command]
pub async fn f2evo_washing_send(
    command: washing::Command,
    state: State<'_, AppState>,
) -> Result<String, String> {
    send(&state, command.to_frame()).await
}

/// Sends the plain-text discovery keyword a board announces itself with.
/// The original app polled every open COM port with this up to 3 times,
/// 200ms apart, until the matching board replied (`MainMenuForm_Load`).
#[tauri::command]
pub async fn f2evo_probe(board: String, state: State<'_, AppState>) -> Result<String, String> {
    let keyword = match board.as_str() {
        "electronics" => "Electronics",
        "hydraulic" => "Hydraulics",
        "washing" => "WASHING",
        other => return Err(format!("unknown board '{other}'")),
    };
    send(&state, keyword.to_string()).await
}

#[tauri::command]
pub fn f2evo_parse_line(line: String) -> F2EvoEvent {
    parse_line(&line)
}

#[tauri::command]
pub fn f2evo_parse_hydraulic_report(text: String) -> hydraulic::ParsedReport {
    hydraulic::parse_report(&text)
}
