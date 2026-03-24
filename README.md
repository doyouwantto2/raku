[![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)]()
[![Tauri](https://img.shields.io/badge/Tauri-FFC131?style=for-the-badge&logo=Tauri&logoColor=white)]()
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=for-the-badge)]()

**Kodoku** is a high-performance, cross-platform piano simulator built with a Rust backend and Tauri frontend. It features real-time audio synthesis using Soundfont (`.sf2`) and a custom visualizer engineered to replicate the experience of **Chromesthesia** (Sound-to-Color Synesthesia).

Every note played doesn't just produce a sound; it renders a specific color and physical particle on the screen, creating a mathematically precise fusion of audio and visual data.

---

## ✨ Demo & Showcase

Watch the software in action. The demo below showcases the automated MIDI parsing engine playing *Kimi no Uso* alongside a manual input demonstration of *Tsubasa wo Kudasai*.

**[🎥 Watch the Video Demo on YouTube/Facebook](LINK_TO_YOUR_VIDEO_HERE)**

### Interface Preview
*(Replace the links below with your actual screenshots)*

| Manual Play Mode | Chromesthesia Visualizer (MIDI Auto-play) |
| :---: | :---: |
| <img src="docs/screenshot_manual.png" width="400"/> | <img src="docs/screenshot_visualizer.png" width="400"/> |
| *Clean UI for manual QWERTY/MIDI input.* | *Real-time color rendering based on note frequencies.* |

---

## 🚀 Key Features

* **High-Fidelity Audio Engine:** Utilizes Rust's low-latency audio processing to load and play high-quality `.sf2` Soundfonts (e.g., Grand Piano), avoiding cheap synthesizer sounds.
* **Dual Input Modes:** * **Manual Mode:** Play using a standard computer keyboard or external MIDI controller.
  * **Automated Parser:** Load `.mid` files to let the engine parse and auto-play complex compositions perfectly.
* **Synesthesia Visualizer:** A custom rendering engine that maps specific audio frequencies and velocities to hex color codes and particle effects, simulating a Chromesthetic experience.
* **Low Latency:** Rust backend ensures zero-lag communication between the audio thread and the visual rendering thread.

---

## 🛠️ Tech Stack

* **Backend:** Rust (Core logic, Audio processing, MIDI parsing).
* **Frontend:** Tauri (Cross-platform GUI bridging).
* **Audio Library:** [Insert your audio crate here, e.g., `rodio` or `cpal`]
* **MIDI Parsing:** [Insert your midi crate here, e.g., `midly`]

---

## 💻 Installation & Build

### Prerequisites
Make sure you have [Rust](https://www.rust-lang.org/tools/install) and the [Tauri CLI](https://tauri.app/v1/guides/getting-started/setup/) installed on your system.

### Build Instructions

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/YOUR_GITHUB_USERNAME/kodoku-piano.git](https://github.com/YOUR_GITHUB_USERNAME/kodoku-piano.git)
   cd kodoku-piano
