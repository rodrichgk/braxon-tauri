# PIC ABS Tester - Tauri Desktop Application

This is the Tauri desktop version of the PIC ABS Hydraulic Testing & Diagnostics application.

## 🚀 Project Structure

```
tauri/
├── src/                    # React frontend source
│   ├── components/         # React components (to be copied from ../src/components)
│   ├── contexts/          # React contexts (WebSocket, Toast, etc.)
│   ├── hooks/             # Custom React hooks
│   ├── pages/             # Page components (Home, Search, Motors)
│   ├── styles/            # CSS and styling
│   ├── types/             # TypeScript type definitions
│   ├── App.tsx            # Main app component
│   └── main.tsx           # React entry point
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs        # Main Rust entry point
│   │   ├── websocket.rs   # WebSocket server (replaces Next.js server)
│   │   ├── serial.rs      # Serial port communication
│   │   ├── database.rs    # SQLite database operations
│   │   └── commands.rs    # Tauri commands (API for frontend)
│   ├── Cargo.toml         # Rust dependencies
│   ├── tauri.conf.json    # Tauri configuration
│   └── build.rs           # Build script
├── package.json           # Node.js dependencies
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # TailwindCSS configuration
└── tsconfig.json          # TypeScript configuration
```

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **Rust** (latest stable version)
- **Tauri CLI**: Install with `cargo install tauri-cli`

## 🔧 Installation

1. **Install Node dependencies:**
   ```bash
   cd tauri
   npm install
   ```

2. **Install Rust dependencies:**
   ```bash
   cd src-tauri
   cargo build
   ```

## 🏃 Development

Run the development server:
```bash
npm run tauri:dev
```

This will:
- Start the Vite dev server for the frontend
- Compile and run the Rust backend
- Open the Tauri window with hot-reload enabled

## 🏗️ Building

Build the production application:
```bash
npm run tauri:build
```

The compiled application will be in `src-tauri/target/release/`.

## 🔄 Migration from Next.js

### Key Differences

1. **No Next.js Server**: The WebSocket server is now implemented in Rust (`src-tauri/src/websocket.rs`)
2. **No API Routes**: Database operations are handled via Tauri commands (`src-tauri/src/commands.rs`)
3. **Desktop App**: Runs as a native desktop application instead of a web server
4. **SQLite Database**: Uses local SQLite instead of Prisma/PostgreSQL

### Migration Steps

1. **Copy Components**: Copy all React components from `../src/components` to `src/components`
2. **Copy Contexts**: Copy context providers from `../src/contexts` to `src/contexts`
3. **Copy Hooks**: Copy custom hooks from `../src/hooks` to `src/hooks`
4. **Copy Types**: Copy TypeScript types from `../src/types` to `src/types`
5. **Update API Calls**: Replace Next.js API calls with Tauri commands:

   **Before (Next.js):**
   ```typescript
   const response = await fetch('/api/abs-data');
   const data = await response.json();
   ```

   **After (Tauri):**
   ```typescript
   import { invoke } from '@tauri-apps/api/tauri';
   const data = await invoke('get_abs_data');
   ```

6. **Update WebSocket**: Replace browser WebSocket with Tauri events:

   **Before:**
   ```typescript
   const ws = new WebSocket('ws://localhost:8765');
   ws.onmessage = (event) => { ... };
   ```

   **After:**
   ```typescript
   import { listen } from '@tauri-apps/api/event';
   await listen('device-message', (event) => { ... });
   ```

### Available Tauri Commands

All commands are defined in `src-tauri/src/commands.rs`:

**Serial Port:**
- `get_serial_ports()` - List available serial ports
- `connect_serial(port_name, baud_rate)` - Connect to serial port
- `disconnect_serial()` - Disconnect from serial port
- `send_serial_message(message)` - Send message to serial port

**WebSocket Devices:**
- `get_devices()` - Get list of connected devices
- `select_device(device_id)` - Pair with a device
- `send_device_message(device_id, message)` - Send message to device

**ABS Data:**
- `get_abs_data()` - Get all ABS data
- `search_abs_data(query)` - Search ABS data
- `save_abs_data(data)` - Save new ABS data
- `update_abs_data(data)` - Update existing ABS data
- `delete_abs_data(id)` - Delete ABS data

**Profiles:**
- `get_profiles()` - Get all test profiles
- `save_profile(profile)` - Save new profile
- `update_profile(profile)` - Update existing profile
- `delete_profile(id)` - Delete profile

**Motor Tests:**
- `get_motor_tests()` - Get all motor tests
- `save_motor_test(test)` - Save motor test result

## 🔌 WebSocket Communication

The Rust WebSocket server (`src-tauri/src/websocket.rs`) handles:
- ESP32 device connections
- Browser client connections
- Device pairing (client-to-ESP32)
- Message routing between paired devices
- Device list broadcasting

Events emitted to frontend:
- `device-list` - Updated list of connected devices
- `device-message` - Messages from paired ESP32 device

## 💾 Database

SQLite database is automatically created on first run. Schema is defined in `src-tauri/src/database.rs`.

Database file location: `pic-abs-tester.db` (in app directory)

## 🎨 Styling

Uses TailwindCSS with custom utility classes defined in `src/styles/globals.css`:
- `.card` - Card container
- `.btn-primary`, `.btn-secondary`, etc. - Button styles
- `.input-field` - Input field style
- `.connection-dot` - Connection status indicator

## 🐛 Debugging

Enable Rust debug logs:
```bash
RUST_LOG=debug npm run tauri:dev
```

Open DevTools in the Tauri window:
- Right-click → Inspect Element
- Or press F12

## 📦 Distribution

After building, the installer will be in:
- **Windows**: `src-tauri/target/release/bundle/msi/`
- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Linux**: `src-tauri/target/release/bundle/appimage/`

## 🔐 Security

Tauri's allowlist is configured in `src-tauri/tauri.conf.json`. Only necessary APIs are enabled:
- File system (scoped to app data directory)
- Dialog (for file pickers)
- Shell (for opening external links)
- Window management

## 📝 Next Steps

1. Copy all components from the Next.js version
2. Update WebSocket context to use Tauri events
3. Replace API calls with Tauri commands
4. Test all functionality
5. Build and distribute

## 🆘 Troubleshooting

**Build fails:**
- Ensure Rust is installed: `rustc --version`
- Update Rust: `rustup update`
- Clean build: `cargo clean` in `src-tauri/`

**WebSocket not connecting:**
- Check if port 8765 is available
- Check firewall settings
- Look for errors in Rust console

**Database errors:**
- Delete `pic-abs-tester.db` to reset database
- Check file permissions
